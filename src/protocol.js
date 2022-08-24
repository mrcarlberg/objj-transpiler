// Both the ClassDef and ProtocolDef conforms to a 'protocol' (That we can't declare in Javascript).
// Both Objects have the attribute 'protocols': Array of ProtocolDef that they conform to
// Both also have the functions: addInstanceMethod, addClassMethod, getInstanceMethod and getClassMethod
// protocolDef = {"name": aProtocolName, "protocols": inheritFromProtocols, "requiredInstanceMethods": requiredInstanceMethodDefs, "requiredClassMethods": requiredClassMethodDefs};

export class ProtocolDef {
  constructor (name, protocols, requiredInstanceMethodDefs, requiredClassMethodDefs) {
    this.name = name
    this.protocols = protocols
    if (requiredInstanceMethodDefs) { this.requiredInstanceMethods = requiredInstanceMethodDefs }
    if (requiredClassMethodDefs) { this.requiredClassMethods = requiredClassMethodDefs }
  }

  addInstanceMethod = function (methodDef) {
    (this.requiredInstanceMethods || (this.requiredInstanceMethods = Object.create(null)))[methodDef.name] = methodDef
  }

  addClassMethod = function (methodDef) {
    (this.requiredClassMethods || (this.requiredClassMethods = Object.create(null)))[methodDef.name] = methodDef
  }

  getInstanceMethod = function (name) {
    const instanceMethods = this.requiredInstanceMethods

    if (instanceMethods) {
      const method = instanceMethods[name]

      if (method) { return method }
    }

    const protocols = this.protocols

    for (let i = 0, size = protocols.length; i < size; i++) {
      const protocol = protocols[i]
      const method = protocol.getInstanceMethod(name)

      if (method) { return method }
    }

    return null
  }

  getClassMethod = function (name) {
    const classMethods = this.requiredClassMethods

    if (classMethods) {
      const method = classMethods[name]

      if (method) { return method }
    }

    const protocols = this.protocols

    for (let i = 0, size = protocols.length; i < size; i++) {
      const protocol = protocols[i]
      const method = protocol.getClassMethod(name)

      if (method) { return method }
    }

    return null
  }
}
