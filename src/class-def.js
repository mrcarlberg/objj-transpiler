// Both the ClassDef and ProtocolDef conforms to a 'protocol' (That we can't declare in Javascript).
// Both Objects have the attribute 'protocols': Array of ProtocolDef that they conform to
// Both also have the functions: addInstanceMethod, addClassMethod, getInstanceMethod and getClassMethod
// classDef = {"className": aClassName, "superClass": superClass , "ivars": myIvars, "instanceMethods": instanceMethodDefs, "classMethods": classMethodDefs, "protocols": myProtocols};

export class ClassDef {
  constructor (isImplementationDeclaration, name, superClass, ivars, instanceMethods, classMethods, protocols) {
    this.name = name
    if (superClass) { this.superClass = superClass }
    if (ivars) { this.ivars = ivars }
    if (isImplementationDeclaration) {
      this.instanceMethods = instanceMethods || Object.create(null)
      this.classMethods = classMethods || Object.create(null)
    }
    if (protocols) { this.protocols = protocols }
  }

  addInstanceMethod (methodDef) {
    this.instanceMethods[methodDef.name] = methodDef
  }

  addClassMethod (methodDef) {
    this.classMethods[methodDef.name] = methodDef
  }

  listOfNotImplementedMethodsForProtocols (protocolDefs) {
    let resultList = []
    const instanceMethods = this.getInstanceMethods()
    const classMethods = this.getClassMethods()

    for (let i = 0, size = protocolDefs.length; i < size; i++) {
      const protocolDef = protocolDefs[i]
      const protocolInstanceMethods = protocolDef.requiredInstanceMethods
      const protocolClassMethods = protocolDef.requiredClassMethods
      const inheritFromProtocols = protocolDef.protocols

      if (protocolInstanceMethods) {
        for (const methodName in protocolInstanceMethods) {
          const methodDef = protocolInstanceMethods[methodName]
          if (!instanceMethods[methodName]) resultList.push({ methodDef, protocolDef })
        }
      }

      if (protocolClassMethods) {
        for (const methodName in protocolClassMethods) {
          const methodDef = protocolClassMethods[methodName]
          if (!classMethods[methodName]) resultList.push({ methodDef, protocolDef })
        }
      }

      if (inheritFromProtocols) { resultList = resultList.concat(this.listOfNotImplementedMethodsForProtocols(inheritFromProtocols)) }
    }

    return resultList
  }

  getInstanceMethod (name) {
    const instanceMethods = this.instanceMethods

    if (instanceMethods) {
      const method = instanceMethods[name]

      if (method) { return method }
    }

    const superClass = this.superClass

    if (superClass) { return superClass.getInstanceMethod(name) }

    return null
  }

  getClassMethod (name) {
    const classMethods = this.classMethods
    if (classMethods) {
      const method = classMethods[name]

      if (method) { return method }
    }

    const superClass = this.superClass

    if (superClass) { return superClass.getClassMethod(name) }

    return null
  }

  // Return a new Array with all instance methods
  getInstanceMethods () {
    const instanceMethods = this.instanceMethods
    if (instanceMethods) {
      const superClass = this.superClass
      const returnObject = Object.create(null)
      if (superClass) {
        const superClassMethods = superClass.getInstanceMethods()
        for (const methodName in superClassMethods) { returnObject[methodName] = superClassMethods[methodName] }
      }

      for (const methodName in instanceMethods) { returnObject[methodName] = instanceMethods[methodName] }

      return returnObject
    }

    return []
  }

  // Return a new Array with all class methods
  getClassMethods () {
    const classMethods = this.classMethods
    if (classMethods) {
      const superClass = this.superClass
      const returnObject = Object.create(null)
      if (superClass) {
        const superClassMethods = superClass.getClassMethods()
        for (const methodName in superClassMethods) { returnObject[methodName] = superClassMethods[methodName] }
      }

      for (const methodName in classMethods) { returnObject[methodName] = classMethods[methodName] }

      return returnObject
    }

    return []
  }
}
