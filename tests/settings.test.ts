import { test } from "node:test";
import assert from "node:assert/strict";
import { Children, isValidElement, type ReactNode } from "react";
import { SettingsModal } from "../src/components/SettingsModal";

test("changing providers clears the previous provider's API key", () => {
  let settings = {
    theme: "system" as const, fontSize: "medium" as const, maxResults: 30,
    provider: "openai", model: "gpt-4o", apiKey: "test-openai-only-key",
  };
  const modal = SettingsModal({
    open: true, settings, onClose() {}, onSave() {},
    providers: [{ id: "deepseek", name: "DeepSeek", defaultModel: "deepseek-chat", models: ["deepseek-chat"] }],
    setSettings: (update) => { settings = (typeof update === "function" ? update(settings) : update) as typeof settings; },
  });
  let changed = false;
  function changeProvider(node: ReactNode): void {
    if (!isValidElement<{ children?: ReactNode; value?: string; onChange?: (e: { target: { value: string } }) => void }>(node)) return;
    if (node.type === "select" && node.props.value === "openai") {
      node.props.onChange?.({ target: { value: "deepseek" } });
      changed = true;
    } else Children.forEach(node.props.children, changeProvider);
  }
  changeProvider(modal);
  assert.ok(changed, "provider selector was found");
  assert.equal(settings.provider, "deepseek");
  assert.equal(settings.model, "deepseek-chat");
  assert.equal(settings.apiKey, "");
});
