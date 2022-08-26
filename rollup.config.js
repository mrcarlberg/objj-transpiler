export default {
  input: "src/index.js",
  external: ["objj-parser", "acorn-walk", "source-map"],
  output: {
    file: "dist/objj-transpiler.cjs",
    format: "umd",
    name: "ObjJCompiler",
    sourcemap: true,
    globals: {
      "acorn-walk": "acorn.walk",
      "objj-parser": "objjParser",
      "source-map": "ObjectiveJ.sourceMap"
    }
  }
}
