import * as Tabs from "@radix-ui/react-tabs";
import type { ScenarioOption } from "./types";

export function ScenarioTabs({
  options,
  value,
  onChange
}: {
  options: ScenarioOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Tabs.Root value={value} onValueChange={onChange} className="scenario-tabs">
      <Tabs.List aria-label="Harness scenarios">
        {options.map((option) => (
          <Tabs.Trigger key={option.id} value={option.id} data-testid={`scenario-${option.id}`}>
            {option.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
