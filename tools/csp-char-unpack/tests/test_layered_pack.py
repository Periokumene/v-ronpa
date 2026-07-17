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


def valid_inspection(*, arm_visible: bool = True, eye_layer_name: str = "0") -> PsdInspection:
    root = make_node("L0001", FakeLayer("MAIN", group=True), "/MAIN")
    body = make_node(
        "L0002",
        FakeLayer("BODY", group=True, image=image_at(10, 10, (255, 0, 0, 255))),
        "/MAIN/BODY",
        parent_id=root.id,
        ancestors=(root.id,),
    )
    body_child = make_node(
        "L0003", FakeLayer("paint"), "/MAIN/BODY/paint", parent_id=body.id, ancestors=(root.id, body.id)
    )
    arm = make_node("L0004", FakeLayer("ArmL", group=True), "/MAIN/ArmL", parent_id=root.id, ancestors=(root.id,))
    arm0 = make_node(
        "L0005",
        FakeLayer("0", group=True, visible=arm_visible, image=image_at(20, 20, (0, 255, 0, 255))),
        "/MAIN/ArmL/0",
        parent_id=arm.id,
        ancestors=(root.id, arm.id),
    )
    arm0_child = make_node(
        "L0006", FakeLayer("paint"), "/MAIN/ArmL/0/paint", parent_id=arm0.id, ancestors=(root.id, arm.id, arm0.id)
    )
    arm1 = make_node(
        "L0007",
        FakeLayer("1", group=True, visible=False, image=image_at(30, 20, (0, 0, 255, 255))),
        "/MAIN/ArmL/1",
        parent_id=arm.id,
        ancestors=(root.id, arm.id),
    )
    arm1_child = make_node(
        "L0008", FakeLayer("paint"), "/MAIN/ArmL/1/paint", parent_id=arm1.id, ancestors=(root.id, arm.id, arm1.id)
    )
    eye = make_node("L0009", FakeLayer("EYE", group=True), "/MAIN/EYE", parent_id=root.id, ancestors=(root.id,))
    eye0 = make_node(
        "L0010",
        FakeLayer(eye_layer_name, group=True, visible=False, image=image_at(40, 10, (255, 255, 0, 255))),
        f"/MAIN/EYE/{eye_layer_name}",
        parent_id=eye.id,
        ancestors=(root.id, eye.id),
    )
    eye0_child = make_node(
        "L0011",
        FakeLayer("paint"),
        f"/MAIN/EYE/{eye_layer_name}/paint",
        parent_id=eye0.id,
        ancestors=(root.id, eye.id, eye0.id),
    )
    nodes = [root, body, body_child, arm, arm0, arm0_child, arm1, arm1_child, eye, eye0, eye0_child]
    return PsdInspection(SimpleNamespace(width=100, height=100), nodes, {"width": 100, "height": 100}, [])


def test_builds_cropped_pack_with_default_and_builtin_tokens(tmp_path: Path) -> None:
    inspection = valid_inspection()
    result = build_layered_character_pack(inspection, tmp_path, "Alice", "/MAIN")

    assert result.sprite_count == 4
    assert result.groups == ("MAIN", "MAIN/ArmL", "MAIN/EYE")
    assert result.source_preview == ("MAIN>BODY", "MAIN/ArmL>0")
    assert result.tokens == {
        "SourcePreview": ["MAIN>BODY", "MAIN/ArmL>0"],
        "Default": ["SourcePreview"],
        "ArmL0": ["MAIN/ArmL>0"],
        "ArmL1": ["MAIN/ArmL>1"],
        "EYE0": ["MAIN/EYE>0"],
        "EYEOff": ["MAIN/EYE-"],
    }
    metadata = json.loads((tmp_path / "assets/layers/MAIN/ArmL/0.json").read_text(encoding="utf-8"))
    assert metadata["localTransform"]["position"] == {"x": 20, "y": 80, "z": 0}
    for metadata_path in (tmp_path / "assets/layers").rglob("*.json"):
        generated_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        assert generated_metadata["sprite"]["pixelsPerUnit"] == 1
        assert generated_metadata["localTransform"]["scale"] == {"x": 1, "y": 1, "z": 1}
    assert Image.open(tmp_path / "assets/layers/MAIN/ArmL/0.png").size == (20, 30)
    character = json.loads((tmp_path / "character.json").read_text(encoding="utf-8"))
    assert character["renderSpace"] == {"stageScale": 7.0, "characterAnchor": [50.0, 160.0]}
    assert validate_pack(tmp_path) == "Validated V-Ronpa character pack 'Alice'."


@pytest.mark.parametrize("invalid_kind", ["zero", "non-square", "mixed-density"])
def test_pack_validator_rejects_invalid_source_pixel_scale(tmp_path: Path, invalid_kind: str) -> None:
    pack_root = tmp_path / invalid_kind
    build_layered_character_pack(valid_inspection(), pack_root, "Alice", "/MAIN")
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


def test_render_parameters_and_all_sprite_bounds_fallback_are_applied(tmp_path: Path) -> None:
    inspection = valid_inspection()
    inspection.by_id["L0002"].layer.name = "TORSO"
    result = build_layered_character_pack(
        inspection,
        tmp_path,
        "Alice",
        "/MAIN",
        reference_stage_height=250,
        anchor_bottom_offset=7,
    )

    character = json.loads((tmp_path / "character.json").read_text(encoding="utf-8"))
    assert character["renderSpace"] == {"stageScale": 2.5, "characterAnchor": [50.0, 57.0]}
    assert "MAIN>TORSO" in result.tokens["SourcePreview"]


def test_rejects_invalid_render_parameters(tmp_path: Path) -> None:
    with pytest.raises(ToolError, match="Reference stage height"):
        build_layered_character_pack(
            valid_inspection(), tmp_path, "Alice", "/MAIN", reference_stage_height=0
        )
    with pytest.raises(ToolError, match="Anchor bottom offset"):
        build_layered_character_pack(
            valid_inspection(), tmp_path, "Alice", "/MAIN", anchor_bottom_offset=-1
        )


def test_rejects_required_group_with_zero_or_multiple_visible_sprites() -> None:
    with pytest.raises(ToolError, match="Required group must select exactly one"):
        discover_leaf_sprites(valid_inspection(arm_visible=False), "/MAIN")

    inspection = valid_inspection()
    inspection.by_id["L0007"].layer.visible = True
    with pytest.raises(ToolError, match="multiple leaf sprites"):
        discover_leaf_sprites(inspection, "/MAIN")


def test_optional_eye_group_allows_zero_visible_and_generates_off() -> None:
    _root, sprites = discover_leaf_sprites(valid_inspection(), "/MAIN")
    assert not [sprite for sprite in sprites if sprite.group == "MAIN/EYE" and sprite.selected_in_source]


def test_rejects_structural_folder_with_direct_drawable_children() -> None:
    inspection = valid_inspection()
    root = inspection.by_id["L0001"]
    inspection.nodes.append(
        make_node("L9999", FakeLayer("direct"), "/MAIN/direct", parent_id=root.id, ancestors=(root.id,))
    )
    with pytest.raises(ToolError, match="mixes child folders and drawable layers"):
        discover_leaf_sprites(inspection, "/MAIN")


def test_rejects_unsafe_names_case_collisions_and_boundary_properties(tmp_path: Path) -> None:
    inspection = valid_inspection()
    inspection.by_id["L0005"].layer.name = "bad-name"
    with pytest.raises(ToolError, match="expression/path characters"):
        discover_leaf_sprites(inspection, "/MAIN")

    inspection = valid_inspection()
    inspection.by_id["L0004"].layer._mask = True
    with pytest.raises(ToolError, match="unsupported independent-render properties"):
        discover_leaf_sprites(inspection, "/MAIN")

    inspection = valid_inspection()
    inspection.by_id["L0005"].layer.name = "Pose"
    inspection.by_id["L0007"].layer.name = "pose"
    with pytest.raises(ToolError, match="Case-insensitive runtime/resource collision"):
        discover_leaf_sprites(inspection, "/MAIN")

    inspection = valid_inspection(eye_layer_name="Off")
    with pytest.raises(ToolError, match="token collision"):
        build_layered_character_pack(inspection, tmp_path, "Alice", "/MAIN")


def test_rejects_empty_folder_and_transparent_sprite(tmp_path: Path) -> None:
    inspection = valid_inspection()
    inspection.nodes = [node for node in inspection.nodes if node.id != "L0011"]
    with pytest.raises(ToolError, match="Empty folder"):
        discover_leaf_sprites(inspection, "/MAIN")

    inspection = valid_inspection()
    inspection.by_id["L0005"].layer._image = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    with pytest.raises(ToolError, match="empty transparent image"):
        build_layered_character_pack(inspection, tmp_path, "Alice", "/MAIN")


def test_rejects_missing_or_leaf_character_root() -> None:
    with pytest.raises(ToolError, match="was not found"):
        discover_leaf_sprites(valid_inspection(), "/UNKNOWN")

    root = make_node("L0001", FakeLayer("MAIN", group=True, image=image_at(0, 0, (0, 0, 0, 255))), "/MAIN")
    child = make_node("L0002", FakeLayer("paint"), "/MAIN/paint", parent_id=root.id, ancestors=(root.id,))
    with pytest.raises(ToolError, match="root must contain sprite folders"):
        discover_leaf_sprites(PsdInspection(SimpleNamespace(width=100, height=100), [root, child], {}, []), "/MAIN")
