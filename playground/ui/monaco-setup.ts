// monaco-setup.ts
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

// Add a virtual module for 'selvedge' to suppress Monaco import errors
monaco.languages.typescript.typescriptDefaults.addExtraLib(
  `// Type definitions for selvedge (virtual)
  export const selvedge: any;
  `,
  'file:///node_modules/@types/selvedge/index.d.ts'
);

// You can add more types here if you want to simulate more of the API
