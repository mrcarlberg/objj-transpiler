import { warningUnusedButSetVariable, createMessage } from './warning.js'

export class Scope {
  constructor (prev, base) {
    this.vars = Object.create(null)

    if (base) for (const key in base) this[key] = base[key]
    this.prev = prev

    if (prev) {
      this.compiler = prev.compiler
      this.nodeStack = prev.nodeStack.slice(0)
      this.nodePriorStack = prev.nodePriorStack.slice(0)
      this.nodeStackOverrideType = prev.nodeStackOverrideType.slice(0)
    } else {
      this.nodeStack = []
      this.nodePriorStack = []
      this.nodeStackOverrideType = []
    }
  }

  toString () {
    return this.ivars ? 'ivars: ' + JSON.stringify(this.ivars) : '<No ivars>'
  }

  compiler () {
    return this.compiler
  }

  rootScope () {
    return this.prev ? this.prev.rootScope() : this
  }

  isRootScope () {
    return !this.prev
  }

  currentClassName () {
    return this.classDef ? this.classDef.name : this.prev ? this.prev.currentClassName() : null
  }

  currentProtocolName () {
    return this.protocolDef ? this.protocolDef.name : this.prev ? this.prev.currentProtocolName() : null
  }

  getIvarForCurrentClass (/* String */ ivarName) {
    if (this.ivars) {
      const ivar = this.ivars[ivarName]
      if (ivar) { return ivar }
    }

    const prev = this.prev

    // Stop at the class declaration
    if (prev && !this.classDef) { return prev.getIvarForCurrentClass(ivarName) }

    return null
  }

  getLvarScope (/* String */ lvarName, /* BOOL */ stopAtMethod) {
    if (this.vars) {
      const lvar = this.vars[lvarName]
      if (lvar) { return this }
    }

    const prev = this.prev

    // Stop at the method declaration
    if (prev && (!stopAtMethod || !this.methodType)) { return prev.getLvarScope(lvarName, stopAtMethod) }

    return this
  }

  getLvar (/* String */ lvarName, /* BOOL */ stopAtMethod) {
    if (this.vars) {
      const lvar = this.vars[lvarName]
      if (lvar) { return lvar }
    }

    const prev = this.prev

    // Stop at the method declaration
    if (prev && (!stopAtMethod || !this.methodType)) { return prev.getLvar(lvarName, stopAtMethod) }

    return null
  }

  getVarScope () {
    const prev = this.prev

    return prev ? prev.getVarScope() : this
  }

  currentMethodType () {
    return this.methodType ? this.methodType : this.prev ? this.prev.currentMethodType() : null
  }

  copyAddedSelfToIvarsToParent () {
    if (this.prev && this.addedSelfToIvars) {
      for (const key in this.addedSelfToIvars) {
        const addedSelfToIvar = this.addedSelfToIvars[key]
        const scopeAddedSelfToIvar = (this.prev.addedSelfToIvars || (this.prev.addedSelfToIvars = Object.create(null)))[key] || (this.prev.addedSelfToIvars[key] = [])

        scopeAddedSelfToIvar.push.apply(scopeAddedSelfToIvar, addedSelfToIvar) // Append at end in parent scope
      }
    }
  }

  addMaybeWarning (warning) {
    const rootScope = this.rootScope()
    let maybeWarnings = rootScope._maybeWarnings

    if (!maybeWarnings) { rootScope._maybeWarnings = maybeWarnings = [warning] } else {
      const lastWarning = maybeWarnings[maybeWarnings.length - 1]

      // MessageSendExpression (and maybe others) will walk some expressions multible times and
      // possible generate warnings multible times. Here we check if this warning is already added
      if (!lastWarning.isEqualTo(warning)) { maybeWarnings.push(warning) }
    }
  }

  variablesNotReadWarnings () {
    const compiler = this.compiler

    // The warning option must be turned on. We can't be top scope. The scope must have some variables
    if (compiler.options.warnings.includes(warningUnusedButSetVariable) && this.prev && this.vars) {
      for (const key in this.vars) {
        const lvar = this.vars[key]

        if (!lvar.isRead && (lvar.type === 'var' || lvar.type === 'let' || lvar.type === 'const')) {
        // print("Variable '" + key + "' is never read: " + lvar.type + ", line: " + lvar.node.start);
          compiler.addWarning(createMessage("Variable '" + key + "' is never read", lvar.node, compiler.source))
        }
      }
    }
  }

  maybeWarnings () {
    return this.rootScope()._maybeWarnings
  }

  pushNode (node, overrideType) {
    // Here we push 3 things to a stack. The node, override type and an array that can keep track of prior nodes on this level.
    // The current node is also pushed to the last prior array.
    // Special case when node is the same as the parent node. This happends when using an override type when walking the AST
    // The same prior list is then used instead of a new empty one.
    const nodePriorStack = this.nodePriorStack
    const length = nodePriorStack.length
    const lastPriorList = length ? nodePriorStack[length - 1] : null
    const lastNode = length ? this.nodeStack[length - 1] : null
    // First add this node to parent list of nodes, if it has one
    if (lastPriorList) {
      if (lastNode !== node) {
        // If not the same node push the node
        lastPriorList.push(node)
      }
    }
    // Use the last prior list if it is the same node
    nodePriorStack.push(lastNode === node ? lastPriorList : [])
    this.nodeStack.push(node)
    this.nodeStackOverrideType.push(overrideType)
  }

  popNode () {
    this.nodeStackOverrideType.pop()
    this.nodePriorStack.pop()
    return this.nodeStack.pop()
  }

  currentNode () {
    const nodeStack = this.nodeStack
    return nodeStack[nodeStack.length - 1]
  }

  currentOverrideType () {
    const nodeStackOverrideType = this.nodeStackOverrideType
    return nodeStackOverrideType[nodeStackOverrideType.length - 1]
  }

  priorNode () {
    const nodePriorStack = this.nodePriorStack
    const length = nodePriorStack.length

    if (length > 1) {
      const parent = nodePriorStack[length - 2]
      const l = parent.length
      return parent[l - 2] || null
    }
    return null
  }

  formatDescription (index, formatDescription, useOverrideForNode) {
    const nodeStack = this.nodeStack
    const length = nodeStack.length

    index = index || 0
    if (index >= length) { return null }

    // Get the nodes backwards from the stack
    const i = length - index - 1
    const currentNode = nodeStack[i]
    const currentFormatDescription = formatDescription || this.compiler.formatDescription
    // Get the parent descriptions except if no formatDescription was provided, then it is the root description
    const parentFormatDescriptions = formatDescription ? formatDescription.parent : currentFormatDescription

    let nextFormatDescription
    if (parentFormatDescriptions) {
      const nodeType = useOverrideForNode === currentNode ? this.nodeStackOverrideType[i] : currentNode.type
      // console.log("nodeType: " + nodeType + ", (useOverrideForNode === currentNode):" +  + !!(useOverrideForNode === currentNode));
      nextFormatDescription = parentFormatDescriptions[nodeType]
      if (useOverrideForNode === currentNode && !nextFormatDescription) {
        // console.log("Stop");
        return null
      }
    }

    // console.log("index: " + index + ", currentNode: " + JSON.stringify(currentNode) + ", currentFormatDescription: " + JSON.stringify(currentFormatDescription) + ", nextFormatDescription: " + JSON.stringify(nextFormatDescription));

    if (nextFormatDescription) {
      // Check for more 'parent' attributes or return nextFormatDescription
      return this.formatDescription(index + 1, nextFormatDescription)
    } else {
      // Check for a virtual node one step up in the stack
      nextFormatDescription = this.formatDescription(index + 1, formatDescription, currentNode)
      if (nextFormatDescription) { return nextFormatDescription } else {
        // Ok, we have found a format description (currentFormatDescription).
        // Lets check if we have any other descriptions dependent on the prior node.
        const priorFormatDescriptions = currentFormatDescription.prior
        if (priorFormatDescriptions) {
          const priorNode = this.priorNode()
          const priorFormatDescription = priorFormatDescriptions[priorNode ? priorNode.type : 'None']
          if (priorFormatDescription) { return priorFormatDescription }
        }
        return currentFormatDescription
      }
    }
  }
}

export class BlockScope extends Scope {
  variablesNotReadWarnings () {
    Scope.prototype.variablesNotReadWarnings.call(this)

    const prev = this.prev

    // Any possible hoisted variable in this scope has to be moved to the previous scope if it is not declared in the previsous scope
    // We can't be top scope. The scope must have some possible hoisted variables
    if (prev && this.possibleHoistedVariables) {
      for (const key in this.possibleHoistedVariables) {
        const possibleHoistedVariable = this.possibleHoistedVariables[key]

        if (possibleHoistedVariable) {
          const varInPrevScope = prev.vars && prev.vars[key]

          if (varInPrevScope != null) {
            const prevPossibleHoistedVariable = (prev.possibleHoistedVariables || (prev.possibleHoistedVariables = Object.create(null)))[key]

            if (prevPossibleHoistedVariable == null) {
              prev.possibleHoistedVariables[key] = possibleHoistedVariable
            } else {
              throw new Error("Internal inconsistency, previous scope should not have this possible hoisted variable '" + key + "'")
            }
          }
        }
      }
    }
  }
}

export class FunctionScope extends BlockScope {
  getVarScope () {
    return this
  }
}
