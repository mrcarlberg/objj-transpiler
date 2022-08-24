export class TypeDef {
  constructor (name) {
    this.name = name
  }
}

// methodDef = {"types": types, "name": selector}
export class MethodDef {
  constructor (name, types) {
    this.name = name
    this.types = types
  }
}
