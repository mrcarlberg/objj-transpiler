// Both the ClassDef and ProtocolDef conforms to a 'protocol' (That we can't declare in Javascript).
// Both Objects have the attribute 'protocols': Array of ProtocolDef that they conform to
// Both also have the functions: addInstanceMethod, addClassMethod, getInstanceMethod and getClassMethod
// classDef = {"className": aClassName, "superClass": superClass , "ivars": myIvars, "instanceMethods": instanceMethodDefs, "classMethods": classMethodDefs, "protocols": myProtocols};

export class ClassDef {
  constructor(isImplementationDeclaration, name, superClass, ivars, instanceMethods, classMethods, protocols) {
    this.name = name
    if (superClass)
      this.superClass = superClass
    if (ivars)
      this.ivars = ivars
    if (isImplementationDeclaration) {
      this.instanceMethods = instanceMethods || Object.create(null)
      this.classMethods = classMethods || Object.create(null)
    }
    if (protocols)
      this.protocols = protocols
  }

  addInstanceMethod(methodDef) {
    this.instanceMethods[methodDef.name] = methodDef
  }

  addClassMethod(methodDef) {
    this.classMethods[methodDef.name] = methodDef
  }

  listOfNotImplementedMethodsForProtocols(protocolDefs) {
    let resultList = [],
        instanceMethods = this.getInstanceMethods(),
        classMethods = this.getClassMethods()

    for (let i = 0, size = protocolDefs.length; i < size; i++) {
      let protocolDef = protocolDefs[i],
          protocolInstanceMethods = protocolDef.requiredInstanceMethods,
          protocolClassMethods = protocolDef.requiredClassMethods,
          inheritFromProtocols = protocolDef.protocols

      if (protocolInstanceMethods) for (var methodName in protocolInstanceMethods) {
        var methodDef = protocolInstanceMethods[methodName]

        if (!instanceMethods[methodName])
          resultList.push({methodDef, protocolDef})
      }

      if (protocolClassMethods) for (var methodName in protocolClassMethods) {
        var methodDef = protocolClassMethods[methodName]

        if (!classMethods[methodName])
          resultList.push({methodDef, protocolDef})
      }

      if (inheritFromProtocols)
        resultList = resultList.concat(this.listOfNotImplementedMethodsForProtocols(inheritFromProtocols))
    }

    return resultList
  }

  getInstanceMethod(name) {
    let instanceMethods = this.instanceMethods

    if (instanceMethods) {
      let method = instanceMethods[name]

      if (method)
        return method
    }

    let superClass = this.superClass

    if (superClass)
      return superClass.getInstanceMethod(name)

    return null
  }

  getClassMethod(name) {
    let classMethods = this.classMethods
    if (classMethods) {
      let method = classMethods[name]

      if (method)
        return method
    }

    let superClass = this.superClass

    if (superClass)
      return superClass.getClassMethod(name)

    return null
  }

  // Return a new Array with all instance methods
  getInstanceMethods() {
    let instanceMethods = this.instanceMethods
    if (instanceMethods) {
      let superClass = this.superClass,
          returnObject = Object.create(null)
      if (superClass) {
        let superClassMethods = superClass.getInstanceMethods()
        for (var methodName in superClassMethods)
          returnObject[methodName] = superClassMethods[methodName]
      }

      for (var methodName in instanceMethods)
        returnObject[methodName] = instanceMethods[methodName]

      return returnObject
    }

    return []
  }

  // Return a new Array with all class methods
  getClassMethods() {
    let classMethods = this.classMethods
    if (classMethods) {
      let superClass = this.superClass,
          returnObject = Object.create(null)
      if (superClass) {
        let superClassMethods = superClass.getClassMethods()
        for (var methodName in superClassMethods)
          returnObject[methodName] = superClassMethods[methodName]
      }

      for (var methodName in classMethods)
        returnObject[methodName] = classMethods[methodName]

      return returnObject
    }

    return []
  }
}
