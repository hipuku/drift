/* Exports one Figma file's variables and components for the parity check.

   Runs inside Figma, against the Plugin API: as the code of a development
   plugin, or through the Figma MCP server's use_figma tool, which is how the
   agent in the design sync workflow refreshes the snapshot. The Plugin API is
   the only way to read variables on a Pro plan. It reads and changes nothing.

   Its return value is saved as figma/snapshot/<file>.json, with an exportedAt
   time added by whoever saves it. `npm run figma:check -- --plugin-code` prints
   the code to paste: this function's source and the call that runs it. The
   function takes `figma` as an argument so this module stays importable. */

export async function exportFile(figma) {
  // Taken before the first read, so an edit made while the export runs is newer
  // than the capture and the snapshot is reported stale rather than fresh.
  const capturedAt = new Date().toISOString();
  const variables = [];
  const byId = {};
  for (const v of await figma.variables.getLocalVariablesAsync()) byId[v.id] = v;
  for (const collection of await figma.variables.getLocalVariableCollectionsAsync()) {
    const mode = collection.defaultModeId;
    for (const id of collection.variableIds) {
      const v = byId[id];
      if (!v) continue;
      const raw = v.valuesByMode[mode];
      let value = raw;
      if (raw && typeof raw === "object" && raw.type === "VARIABLE_ALIAS") {
        const target = byId[raw.id] ?? (await figma.variables.getVariableByIdAsync(raw.id));
        const syntax = target?.codeSyntax?.WEB?.match(/var\((--[\w-]+)\)/);
        // The same rule as variableToProperty in normalise.mjs: code syntax first,
        // then the name with slashes as hyphens.
        const property = target
          ? `--drift-${target.name.replace(/\//g, "-")}`
          : `unresolved ${raw.id}`;
        value = { alias: syntax ? syntax[1] : property };
      } else if (raw && typeof raw === "object" && "r" in raw) {
        const hex = [raw.r, raw.g, raw.b]
          .map((x) =>
            Math.round(x * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("");
        const alpha =
          raw.a !== undefined && raw.a < 1
            ? Math.round(raw.a * 255)
                .toString(16)
                .padStart(2, "0")
            : "";
        value = { hex: `#${hex}${alpha}` };
      }
      variables.push({
        collection: collection.name,
        name: v.name,
        type: v.resolvedType,
        codeSyntax: v.codeSyntax?.WEB ? { WEB: v.codeSyntax.WEB } : undefined,
        value,
      });
    }
  }

  const components = [];
  for (const page of figma.root.children) {
    await page.loadAsync();
    for (const node of page.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
      // A variant inside a set has no definitions of its own; reading them throws.
      const inSet = node.parent?.type === "COMPONENT_SET";
      components.push({
        name: node.name,
        page: page.name,
        type: node.type,
        inSet,
        props: Object.entries(inSet ? {} : (node.componentPropertyDefinitions ?? {})).map(
          ([name, d]) => ({
            name,
            type: d.type,
            options: d.variantOptions ?? [],
          }),
        ),
      });
    }
  }

  return { capturedAt, variables, components };
}

/* A function body, as the Figma MCP server's use_figma tool runs code: its
   last statement returns the export. To run it as a development plugin
   instead, wrap it: `(async () => { ... })().then(r => console.log(JSON.stringify(r)))`. */
export const pluginCode = () => `${exportFile.toString()}\nreturn await exportFile(figma)\n`;
