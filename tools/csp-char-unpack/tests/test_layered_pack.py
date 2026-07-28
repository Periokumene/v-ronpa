from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw

from csp_char_unpack.errors import ToolError
from csp_char_unpack.layered_pack import build_layered_character_pack, discover_leaf_sprites
from csp_char_unpack.pipeline import validate_pack
from csp_char_unpack.psd_report import PsdInspection, PsdNode
from csp_char_unpack.qa import _variant_sheet


class FakeLayer:
    def __init__(
        self,
        name: str,
        *,
        group: bool = False,
        visible: bool = True,
        image: Image.Image | None = None,
        blend_mode: str = "NORMAL",
        mask: bool = False,
        effects: bool = False,
        clipping: bool = False,
    ) -> None:
        self.name = name
        self.kind = "group" if group else "pixel"
        self.visible = visible
        self.opacity = 255
        self.blend_mode = SimpleNamespace(name=blend_mode, value=b"norm")
        self.bbox = (0, 0, 100, 100)
        self.clipping = clipping
        self.locks = 0
        self._group = group
        self._image = image
        self._mask = mask
        self._effects = effects

    def is_group(self) -> bool:
        return self._group

    def is_visible(self) -> bool:
        return self.visible

    def has_mask(self) -> bool:
        return self._mask

    def has_vector_mask(self) -> bool:
        return False

    def has_effects(self) -> bool:
        return self._effects

    def has_pixels(self) -> bool:
        return not self._group

    def composite(self, **_kwargs: object) -> Image.Image | None:
        assert self.visible
        return self._image.copy() if self._image is not None else None


def image_at(left: int, top: int, color: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).rectangle((left, top, left + 19, top + 29), fill=color)
    return canvas


def make_node(
    node_id: str,
    layer: FakeLayer,
    path: str,
    *,
    parent_id: str | None = None,
    ancestors: tuple[str, ...] = (),
) -> PsdNode:
    return PsdNode(node_id, layer, parent_id, ancestors, path, len(ancestors), 0)


def valid_inspection(
    *,
    body_specs: tuple[tuple[str, bool], ...] = (("0", True),),
    group_specs: tuple[tuple[str, tuple[tuple[str, bool], ...]], ...] = (
        ("mouth", (("0", True), ("1", False))),
    ),
    body_visible: bool = True,
    body_image: Image.Image | None = None,
) -> PsdInspection:
    root = make_node("L0001", FakeLayer("root", group=True), "/root")
    body = make_node(
        "L0002",
        FakeLayer("body", group=True, visible=body_visible),
        "/root/body",
        parent_id=root.id,
        ancestors=(root.id,),
    )
    nodes = [root, body]
    next_id = 3
    for variant_index, (variant_name, visible) in enumerate(body_specs):
        variant = make_node(
            f"L{next_id:04d}",
            FakeLayer(
                variant_name,
                group=True,
                visible=visible,
                image=(
                    body_image
                    if variant_index == 0 and body_image is not None
                    else image_at(10 + variant_index * 5, 10, (255, 0, 0, 255))
                ),
            ),
            f"/root/body/{variant_name}",
            parent_id=body.id,
            ancestors=(root.id, body.id),
        )
        next_id += 1
        paint = make_node(
            f"L{next_id:04d}",
            FakeLayer("paint"),
            f"/root/body/{variant_name}/paint",
            parent_id=variant.id,
            ancestors=(root.id, body.id, variant.id),
        )
        next_id += 1
        nodes.extend([variant, paint])
    colors = [(0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255), (255, 0, 255, 255)]
    for group_index, (group_name, variants) in enumerate(group_specs):
        group = make_node(
            f"L{next_id:04d}",
            FakeLayer(group_name, group=True),
            f"/root/{group_name}",
            parent_id=root.id,
            ancestors=(root.id,),
        )
        next_id += 1
        nodes.append(group)
        for variant_index, (variant_name, visible) in enumerate(variants):
            variant = make_node(
                f"L{next_id:04d}",
                FakeLayer(
                    variant_name,
                    group=True,
                    visible=visible,
                    image=image_at(
                        20 + group_index * 10 + variant_index * 5,
                        20,
                        colors[(group_index + variant_index) % len(colors)],
                    ),
                ),
                f"/root/{group_name}/{variant_name}",
                parent_id=group.id,
                ancestors=(root.id, group.id),
            )
            next_id += 1
            paint = make_node(
                f"L{next_id:04d}",
                FakeLayer("paint"),
                f"/root/{group_name}/{variant_name}/paint",
                parent_id=variant.id,
                ancestors=(root.id, group.id, variant.id),
            )
            next_id += 1
            nodes.extend([variant, paint])
    return PsdInspection(SimpleNamespace(width=100, height=100), nodes, {"width": 100, "height": 100}, [])


def test_builds_v3_pack_with_lower_camel_tokens_and_body_anchor(tmp_path: Path) -> None:
    result = build_layered_character_pack(valid_inspection(), tmp_path, "alice")

    assert result.sprite_count == 3
    assert result.groups == ("root/body", "root/mouth")
    assert result.source_preview == ("root/body>0", "root/mouth>0")
    assert result.tokens == {
        "sourcePreview": ["root/body>0", "root/mouth>0"],
        "default": ["sourcePreview"],
        "body0": ["root/body>0"],
        "mouth0": ["root/mouth>0"],
        "mouth1": ["root/mouth>1"],
    }
    metadata = json.loads((tmp_path / "assets/layers/root/mouth/0.json").read_text(encoding="utf-8"))
    assert metadata["localTransform"]["position"] == {"x": 20, "y": 80, "z": 0}
    for metadata_path in (tmp_path / "assets/layers").rglob("*.json"):
        generated = json.loads(metadata_path.read_text(encoding="utf-8"))
        assert generated["sprite"]["pixelsPerUnit"] == 1
        assert generated["localTransform"]["scale"] == {"x": 1, "y": 1, "z": 1}
    character = json.loads((tmp_path / "character.json").read_text(encoding="utf-8"))
    assert character == {
        "id": "alice",
        "defaultComposition": ["default"],
        "renderSpace": {"stageScale": 7.0, "characterAnchor": [50.0, 160.0]},
    }
    assert validate_pack(tmp_path) == "Validated V-Ronpa character pack 'alice'."


def test_body_only_and_extensible_group_are_supported(tmp_path: Path) -> None:
    body_only = tmp_path / "body-only"
    result = build_layered_character_pack(valid_inspection(group_specs=()), body_only, "body-only")
    assert result.groups == ("root/body",)
    assert result.tokens == {
        "sourcePreview": ["root/body>0"],
        "default": ["sourcePreview"],
        "body0": ["root/body>0"],
    }

    leg_pack = tmp_path / "leg"
    result = build_layered_character_pack(
        valid_inspection(group_specs=(("leg", (("0", True), ("1", False), ("2", False))),)),
        leg_pack,
        "leg",
    )
    assert [name for name in result.tokens if name.startswith("leg")] == ["leg0", "leg1", "leg2"]


def test_body_variants_generate_tokens_and_anchor_from_body_zero(tmp_path: Path) -> None:
    inspection = valid_inspection(
        body_specs=(("0", True), ("1", False), ("2", False)),
        group_specs=(),
    )
    next(node for node in inspection.nodes if node.path == "/root/body/1").layer._image = image_at(
        10,
        60,
        (0, 255, 0, 255),
    )
    result = build_layered_character_pack(inspection, tmp_path, "body-variants")

    assert result.groups == ("root/body",)
    assert result.source_preview == ("root/body>0",)
    assert result.tokens == {
        "sourcePreview": ["root/body>0"],
        "default": ["sourcePreview"],
        "body0": ["root/body>0"],
        "body1": ["root/body>1"],
        "body2": ["root/body>2"],
    }
    character = json.loads((tmp_path / "character.json").read_text(encoding="utf-8"))
    assert character["renderSpace"]["characterAnchor"] == [50.0, 160.0]


def test_effect_is_optional_defaults_off_and_generates_explicit_off(tmp_path: Path) -> None:
    result = build_layered_character_pack(
        valid_inspection(
            group_specs=(
                ("mouth", (("0", True), ("1", False))),
                ("effect", (("0", False), ("1", False))),
            )
        ),
        tmp_path,
        "alice-kid",
    )
    assert result.source_preview == ("root/body>0", "root/mouth>0")
    assert result.tokens["effect0"] == ["root/effect>0"]
    assert result.tokens["effect1"] == ["root/effect>1"]
    assert result.tokens["effectOff"] == ["root/effect-"]


def test_variant_qa_sheet_covers_every_variant_including_hidden_effect(tmp_path: Path) -> None:
    pack_root = tmp_path / "pack"
    result = build_layered_character_pack(
        valid_inspection(
            group_specs=(
                ("mouth", (("0", True), ("1", False), ("2", False))),
                ("effect", (("0", False), ("1", False))),
            )
        ),
        pack_root,
        "qa",
    )
    mouth_sheet = tmp_path / "reports/variants/mouth.png"
    effect_sheet = tmp_path / "reports/variants/effect.png"
    body_sheet = tmp_path / "reports/variants/body.png"
    assert _variant_sheet(pack_root, result, "root/body", (100, 100), body_sheet) == 1
    assert _variant_sheet(pack_root, result, "root/mouth", (100, 100), mouth_sheet) == 3
    assert _variant_sheet(pack_root, result, "root/effect", (100, 100), effect_sheet) == 2
    assert body_sheet.is_file()
    assert mouth_sheet.is_file()
    assert effect_sheet.is_file()


def test_source_group_order_becomes_draw_order(tmp_path: Path) -> None:
    result = build_layered_character_pack(
        valid_inspection(
            group_specs=(
                ("leg", (("0", True),)),
                ("hairFront", (("0", True),)),
            )
        ),
        tmp_path,
        "ordered",
    )
    assert [(record["id"], record["drawOrder"]) for record in result.sprites] == [
        ("root/body>0", 0),
        ("root/leg>0", 1),
        ("root/hairFront>0", 2),
    ]


@pytest.mark.parametrize("invalid_kind", ["zero", "non-square", "mixed-density"])
def test_pack_validator_rejects_invalid_source_pixel_scale(tmp_path: Path, invalid_kind: str) -> None:
    pack_root = tmp_path / invalid_kind
    build_layered_character_pack(valid_inspection(), pack_root, "alice")
    metadata_paths = sorted((pack_root / "assets/layers").rglob("*.json"))
    first = json.loads(metadata_paths[0].read_text(encoding="utf-8"))
    if invalid_kind == "zero":
        first["localTransform"]["scale"]["x"] = 0
        metadata_paths[0].write_text(json.dumps(first), encoding="utf-8")
    elif invalid_kind == "non-square":
        first["localTransform"]["scale"]["y"] = 2
        metadata_paths[0].write_text(json.dumps(first), encoding="utf-8")
    else:
        second = json.loads(metadata_paths[1].read_text(encoding="utf-8"))
        second["localTransform"]["scale"]["x"] = 2
        second["localTransform"]["scale"]["y"] = 2
        metadata_paths[1].write_text(json.dumps(second), encoding="utf-8")

    with pytest.raises(ToolError, match="invalid source-pixel scale"):
        validate_pack(pack_root)


def test_explicit_render_parameters_are_applied(tmp_path: Path) -> None:
    build_layered_character_pack(
        valid_inspection(),
        tmp_path,
        "alice",
        reference_stage_height=250,
        anchor_bottom_offset=7,
    )
    character = json.loads((tmp_path / "character.json").read_text(encoding="utf-8"))
    assert character["renderSpace"] == {"stageScale": 2.5, "characterAnchor": [50.0, 67.0]}


def test_rejects_invalid_render_parameters(tmp_path: Path) -> None:
    with pytest.raises(ToolError, match="Reference stage height"):
        build_layered_character_pack(valid_inspection(), tmp_path, "alice", reference_stage_height=0)
    with pytest.raises(ToolError, match="Anchor bottom offset"):
        build_layered_character_pack(valid_inspection(), tmp_path, "alice", anchor_bottom_offset=-1)


def test_rejects_missing_main_named_or_non_group_root() -> None:
    inspection = valid_inspection()
    inspection.by_id["L0001"].layer.name = "MAIN"
    inspection.nodes[0].path = "/MAIN"
    with pytest.raises(ToolError, match="/root"):
        discover_leaf_sprites(inspection)

    inspection = valid_inspection()
    inspection.by_id["L0001"].layer._group = False
    with pytest.raises(ToolError, match="/root"):
        discover_leaf_sprites(inspection)


def test_rejects_missing_hidden_transparent_or_non_leaf_body(tmp_path: Path) -> None:
    inspection = valid_inspection()
    inspection.nodes = [node for node in inspection.nodes if not node.path.startswith("/root/body")]
    with pytest.raises(ToolError, match="exactly one"):
        discover_leaf_sprites(inspection)

    with pytest.raises(ToolError, match="effectively visible"):
        discover_leaf_sprites(valid_inspection(body_visible=False))

    transparent = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    with pytest.raises(ToolError, match="empty transparent"):
        build_layered_character_pack(valid_inspection(body_image=transparent), tmp_path, "alice")

    inspection = valid_inspection()
    body_zero = next(node for node in inspection.nodes if node.path == "/root/body/0")
    nested = make_node(
        "L9999",
        FakeLayer("nested", group=True),
        "/root/body/0/nested",
        parent_id=body_zero.id,
        ancestors=(*body_zero.ancestor_ids, body_zero.id),
    )
    inspection.nodes.append(nested)
    with pytest.raises(ToolError, match="Nested runtime folders"):
        discover_leaf_sprites(inspection)


@pytest.mark.parametrize(
    ("body_specs", "message"),
    [
        ((), "contains no variants"),
        ((("1", True),), "continuous"),
        ((("0", False),), "select only variant 0"),
        ((("0", True), ("1", True)), "select only variant 0"),
    ],
)
def test_rejects_invalid_body_variant_contract(
    body_specs: tuple[tuple[str, bool], ...],
    message: str,
) -> None:
    with pytest.raises(ToolError, match=message):
        discover_leaf_sprites(valid_inspection(body_specs=body_specs))


def test_rejects_legacy_or_mixed_direct_body_drawables() -> None:
    inspection = valid_inspection()
    body = next(node for node in inspection.nodes if node.path == "/root/body")
    inspection.nodes.append(
        make_node(
            "L9998",
            FakeLayer("legacyPaint"),
            "/root/body/legacyPaint",
            parent_id=body.id,
            ancestors=(*body.ancestor_ids, body.id),
        )
    )
    with pytest.raises(ToolError, match="only numeric variant folders"):
        discover_leaf_sprites(inspection)


def test_rejects_body_and_effect_order_violations() -> None:
    inspection = valid_inspection()
    root = inspection.nodes.pop(0)
    body_nodes = inspection.nodes[:3]
    other_nodes = inspection.nodes[3:]
    inspection.nodes = [root, *other_nodes, *body_nodes]
    with pytest.raises(ToolError, match="backmost"):
        discover_leaf_sprites(inspection)

    inspection = valid_inspection(
        group_specs=(
            ("effect", (("0", False),)),
            ("mouth", (("0", True),)),
        )
    )
    with pytest.raises(ToolError, match="frontmost"):
        discover_leaf_sprites(inspection)


@pytest.mark.parametrize("group_name", ["Mouth", "mouth-name", "mouth/name", "", "éye"])
def test_rejects_non_lower_camel_runtime_group_names(group_name: str) -> None:
    with pytest.raises(ToolError, match="lower camel|unsafe|expression/path"):
        discover_leaf_sprites(valid_inspection(group_specs=((group_name, (("0", True),)),)))


@pytest.mark.parametrize(
    ("variants", "message"),
    [
        ((("pose", True),), "decimal integer"),
        ((("00", True),), "leading zeroes"),
        ((("0", True), ("2", False)), "continuous"),
    ],
)
def test_rejects_invalid_variant_sequences(
    variants: tuple[tuple[str, bool], ...],
    message: str,
) -> None:
    with pytest.raises(ToolError, match=message):
        discover_leaf_sprites(valid_inspection(group_specs=(("mouth", variants),)))


@pytest.mark.parametrize(
    "variants",
    [
        (("0", False), ("1", False)),
        (("0", True), ("1", True)),
        (("0", False), ("1", True)),
    ],
)
def test_rejects_ordinary_group_without_exactly_variant_zero(
    variants: tuple[tuple[str, bool], ...],
) -> None:
    with pytest.raises(ToolError, match="select only variant 0"):
        discover_leaf_sprites(valid_inspection(group_specs=(("mouth", variants),)))


def test_rejects_visible_effect_variant() -> None:
    with pytest.raises(ToolError, match="effect variants must all be hidden"):
        discover_leaf_sprites(valid_inspection(group_specs=(("effect", (("0", True),)),)))


def test_rejects_nested_variant_group_and_direct_runtime_drawable() -> None:
    inspection = valid_inspection()
    group = next(node for node in inspection.nodes if node.path == "/root/mouth")
    variant = next(node for node in inspection.nodes if node.path == "/root/mouth/0")
    nested = make_node(
        "L9999",
        FakeLayer("nested", group=True),
        "/root/mouth/0/nested",
        parent_id=variant.id,
        ancestors=(*variant.ancestor_ids, variant.id),
    )
    inspection.nodes.append(nested)
    with pytest.raises(ToolError, match="Nested runtime folders"):
        discover_leaf_sprites(inspection)

    inspection = valid_inspection()
    group = next(node for node in inspection.nodes if node.path == "/root/mouth")
    inspection.nodes.append(
        make_node(
            "L9998",
            FakeLayer("paint"),
            "/root/mouth/paint",
            parent_id=group.id,
            ancestors=("L0001", group.id),
        )
    )
    with pytest.raises(ToolError, match="only numeric variant folders"):
        discover_leaf_sprites(inspection)


def test_rejects_portable_collisions_and_boundary_properties() -> None:
    with pytest.raises(ToolError, match="collision"):
        discover_leaf_sprites(
            valid_inspection(
                group_specs=(
                    ("armR", (("0", True),)),
                    ("armr", (("0", True),)),
                )
            )
        )

    inspection = valid_inspection()
    next(node for node in inspection.nodes if node.path == "/root/mouth").layer._mask = True
    with pytest.raises(ToolError, match="unsupported independent-render properties"):
        discover_leaf_sprites(inspection)


def test_rejects_cross_group_generated_token_collision(tmp_path: Path) -> None:
    variants = tuple((str(index), index == 0) for index in range(11))
    inspection = valid_inspection(
        group_specs=(
            ("a", variants),
            ("a1", (("0", True),)),
        )
    )
    with pytest.raises(ToolError, match="token collision"):
        build_layered_character_pack(inspection, tmp_path, "collision")
