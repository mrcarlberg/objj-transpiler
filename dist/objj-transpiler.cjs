(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('objj-parser'), require('source-map'), require('acorn-walk')) :
  typeof define === 'function' && define.amd ? define(['exports', 'objj-parser', 'source-map', 'acorn-walk'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ObjJCompiler = {}, global.objjParser, global.ObjectiveJ.sourceMap, global.acorn.walk));
})(this, (function (exports, objjParser, sourceMap, walk) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n["default"] = e;
    return Object.freeze(n);
  }

  var objjParser__namespace = /*#__PURE__*/_interopNamespace(objjParser);
  var walk__default = /*#__PURE__*/_interopDefaultLegacy(walk);

  class GlobalVariableMaybeWarning {
    constructor (/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code) {
      this.message = createMessage(aMessage, node, code);
      this.node = node;
    }

    checkIfWarning = function (/* Scope */ st) {
      const identifier = this.node.name;
      return !st.getLvar(identifier) && typeof global[identifier] === 'undefined' && (typeof window === 'undefined' || typeof window[identifier] === 'undefined') && !st.compiler.getClassDef(identifier)
    }

    isEqualTo = function (/* GlobalVariableMaybeWarning */ aWarning) {
      if (this.message.message !== aWarning.message.message) return false
      if (this.node.start !== aWarning.node.start) return false
      if (this.node.end !== aWarning.node.end) return false

      return true
    }
  }

  const warningUnusedButSetVariable = { name: 'unused-but-set-variable' };
  const warningShadowIvar = { name: 'shadow-ivar' };
  const warningCreateGlobalInsideFunctionOrMethod = { name: 'create-global-inside-function-or-method' };
  const warningUnknownClassOrGlobal = { name: 'unknown-class-or-global' };
  const warningUnknownIvarType = { name: 'unknown-ivar-type' };
  const AllWarnings = [warningUnusedButSetVariable, warningShadowIvar, warningCreateGlobalInsideFunctionOrMethod, warningUnknownClassOrGlobal, warningUnknownIvarType];

  function getLineOffsets (code, offset) {
    let lineEnd = offset;
    while (lineEnd < code.length) {
      if (objjParser__namespace.isNewLine(code.charCodeAt(lineEnd))) {
        break
      }
      lineEnd++;
    }
    let lineStart = offset;
    while (lineStart > 0) {
      if (objjParser__namespace.isNewLine(code.charCodeAt(lineStart))) {
        lineStart++;
        break
      }
      lineStart--;
    }
    return { lineStart, lineEnd }
  }

  function createMessage (/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code) {
    const message = {};
    const { lineStart, lineEnd } = getLineOffsets(code, node.start);
    const { line, column } = objjParser__namespace.getLineInfo(code, node.start);
    message.lineStart = lineStart;
    message.lineEnd = lineEnd;
    message.line = line;
    message.column = column;
    message.message = aMessage;
    // As a SyntaxError object can't change the property 'line' we also set the property 'messageOnLine'
    message.messageOnLine = message.line;
    message.messageOnColumn = message.column;
    message.messageForNode = node;
    message.messageType = 'WARNING';
    message.messageForLine = code.substring(message.lineStart, message.lineEnd);

    return message
  }

  class Scope {
    constructor (prev, base) {
      this.vars = Object.create(null);

      if (base) for (const key in base) this[key] = base[key];
      this.prev = prev;

      if (prev) {
        this.compiler = prev.compiler;
        this.nodeStack = prev.nodeStack.slice(0);
        this.nodePriorStack = prev.nodePriorStack.slice(0);
        this.nodeStackOverrideType = prev.nodeStackOverrideType.slice(0);
      } else {
        this.nodeStack = [];
        this.nodePriorStack = [];
        this.nodeStackOverrideType = [];
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
        const ivar = this.ivars[ivarName];
        if (ivar) { return ivar }
      }

      const prev = this.prev;

      // Stop at the class declaration
      if (prev && !this.classDef) { return prev.getIvarForCurrentClass(ivarName) }

      return null
    }

    getLvarScope (/* String */ lvarName, /* BOOL */ stopAtMethod) {
      if (this.vars) {
        const lvar = this.vars[lvarName];
        if (lvar) { return this }
      }

      const prev = this.prev;

      // Stop at the method declaration
      if (prev && (!stopAtMethod || !this.methodType)) { return prev.getLvarScope(lvarName, stopAtMethod) }

      return this
    }

    getLvar (/* String */ lvarName, /* BOOL */ stopAtMethod) {
      if (this.vars) {
        const lvar = this.vars[lvarName];
        if (lvar) { return lvar }
      }

      const prev = this.prev;

      // Stop at the method declaration
      if (prev && (!stopAtMethod || !this.methodType)) { return prev.getLvar(lvarName, stopAtMethod) }

      return null
    }

    getVarScope () {
      const prev = this.prev;

      return prev ? prev.getVarScope() : this
    }

    currentMethodType () {
      return this.methodType ? this.methodType : this.prev ? this.prev.currentMethodType() : null
    }

    copyAddedSelfToIvarsToParent () {
      if (this.prev && this.addedSelfToIvars) {
        for (const key in this.addedSelfToIvars) {
          const addedSelfToIvar = this.addedSelfToIvars[key];
          const scopeAddedSelfToIvar = (this.prev.addedSelfToIvars || (this.prev.addedSelfToIvars = Object.create(null)))[key] || (this.prev.addedSelfToIvars[key] = []);

          scopeAddedSelfToIvar.push.apply(scopeAddedSelfToIvar, addedSelfToIvar); // Append at end in parent scope
        }
      }
    }

    addMaybeWarning (warning) {
      const rootScope = this.rootScope();
      let maybeWarnings = rootScope._maybeWarnings;

      if (!maybeWarnings) { rootScope._maybeWarnings = maybeWarnings = [warning]; } else {
        const lastWarning = maybeWarnings[maybeWarnings.length - 1];

        // MessageSendExpression (and maybe others) will walk some expressions multible times and
        // possible generate warnings multible times. Here we check if this warning is already added
        if (!lastWarning.isEqualTo(warning)) { maybeWarnings.push(warning); }
      }
    }

    variablesNotReadWarnings () {
      const compiler = this.compiler;

      // The warning option must be turned on. We can't be top scope. The scope must have some variables
      if (compiler.options.warnings.includes(warningUnusedButSetVariable) && this.prev && this.vars) {
        for (const key in this.vars) {
          const lvar = this.vars[key];

          if (!lvar.isRead && (lvar.type === 'var' || lvar.type === 'let' || lvar.type === 'const')) {
          // print("Variable '" + key + "' is never read: " + lvar.type + ", line: " + lvar.node.start);
            compiler.addWarning(createMessage("Variable '" + key + "' is never read", lvar.node, compiler.source));
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
      const nodePriorStack = this.nodePriorStack;
      const length = nodePriorStack.length;
      const lastPriorList = length ? nodePriorStack[length - 1] : null;
      const lastNode = length ? this.nodeStack[length - 1] : null;
      // First add this node to parent list of nodes, if it has one
      if (lastPriorList) {
        if (lastNode !== node) {
          // If not the same node push the node
          lastPriorList.push(node);
        }
      }
      // Use the last prior list if it is the same node
      nodePriorStack.push(lastNode === node ? lastPriorList : []);
      this.nodeStack.push(node);
      this.nodeStackOverrideType.push(overrideType);
    }

    popNode () {
      this.nodeStackOverrideType.pop();
      this.nodePriorStack.pop();
      return this.nodeStack.pop()
    }

    currentNode () {
      const nodeStack = this.nodeStack;
      return nodeStack[nodeStack.length - 1]
    }

    currentOverrideType () {
      const nodeStackOverrideType = this.nodeStackOverrideType;
      return nodeStackOverrideType[nodeStackOverrideType.length - 1]
    }

    priorNode () {
      const nodePriorStack = this.nodePriorStack;
      const length = nodePriorStack.length;

      if (length > 1) {
        const parent = nodePriorStack[length - 2];
        const l = parent.length;
        return parent[l - 2] || null
      }
      return null
    }

    formatDescription (index, formatDescription, useOverrideForNode) {
      const nodeStack = this.nodeStack;
      const length = nodeStack.length;

      index = index || 0;
      if (index >= length) { return null }

      // Get the nodes backwards from the stack
      const i = length - index - 1;
      const currentNode = nodeStack[i];
      const currentFormatDescription = formatDescription || this.compiler.formatDescription;
      // Get the parent descriptions except if no formatDescription was provided, then it is the root description
      const parentFormatDescriptions = formatDescription ? formatDescription.parent : currentFormatDescription;

      let nextFormatDescription;
      if (parentFormatDescriptions) {
        const nodeType = useOverrideForNode === currentNode ? this.nodeStackOverrideType[i] : currentNode.type;
        // console.log("nodeType: " + nodeType + ", (useOverrideForNode === currentNode):" +  + !!(useOverrideForNode === currentNode));
        nextFormatDescription = parentFormatDescriptions[nodeType];
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
        nextFormatDescription = this.formatDescription(index + 1, formatDescription, currentNode);
        if (nextFormatDescription) { return nextFormatDescription } else {
          // Ok, we have found a format description (currentFormatDescription).
          // Lets check if we have any other descriptions dependent on the prior node.
          const priorFormatDescriptions = currentFormatDescription.prior;
          if (priorFormatDescriptions) {
            const priorNode = this.priorNode();
            const priorFormatDescription = priorFormatDescriptions[priorNode ? priorNode.type : 'None'];
            if (priorFormatDescription) { return priorFormatDescription }
          }
          return currentFormatDescription
        }
      }
    }
  }

  class BlockScope extends Scope {
    variablesNotReadWarnings () {
      Scope.prototype.variablesNotReadWarnings.call(this);

      const prev = this.prev;

      // Any possible hoisted variable in this scope has to be moved to the previous scope if it is not declared in the previsous scope
      // We can't be top scope. The scope must have some possible hoisted variables
      if (prev && this.possibleHoistedVariables) {
        for (const key in this.possibleHoistedVariables) {
          const possibleHoistedVariable = this.possibleHoistedVariables[key];

          if (possibleHoistedVariable) {
            const varInPrevScope = prev.vars && prev.vars[key];

            if (varInPrevScope != null) {
              const prevPossibleHoistedVariable = (prev.possibleHoistedVariables || (prev.possibleHoistedVariables = Object.create(null)))[key];

              if (prevPossibleHoistedVariable == null) {
                prev.possibleHoistedVariables[key] = possibleHoistedVariable;
              } else {
                throw new Error("Internal inconsistency, previous scope should not have this possible hoisted variable '" + key + "'")
              }
            }
          }
        }
      }
    }
  }

  class FunctionScope extends BlockScope {
    getVarScope () {
      return this
    }
  }

  class StringBuffer {
    constructor (useSourceNode, file, sourceContent) {
      if (useSourceNode) {
        this.rootNode = new sourceMap.SourceNode();
        this.concat = this.concatSourceNode;
        this.toString = this.toStringSourceNode;
        this.isEmpty = this.isEmptySourceNode;
        this.appendStringBuffer = this.appendStringBufferSourceNode;
        this.length = this.lengthSourceNode;
        this.removeAtIndex = this.removeAtIndexSourceNode;
        if (file) {
          const fileString = file.toString();
          const filename = fileString.substr(fileString.lastIndexOf('/') + 1);
          const sourceRoot = fileString.substr(0, fileString.lastIndexOf('/') + 1);

          this.filename = filename;

          if (sourceRoot.length > 0) { this.sourceRoot = sourceRoot; }
          if (sourceContent != null) { this.rootNode.setSourceContent(filename, sourceContent); }
        }

        if (sourceContent != null) { this.sourceContent = sourceContent; }
      } else {
        this.atoms = [];
        this.concat = this.concatString;
        this.toString = this.toStringString;
        this.isEmpty = this.isEmptyString;
        this.appendStringBuffer = this.appendStringBufferString;
        this.length = this.lengthString;
        this.removeAtIndex = this.removeAtIndexString;
      }
    }

    toStringString () {
      return this.atoms.join('')
    }

    toStringSourceNode () {
      return this.rootNode.toStringWithSourceMap({ file: this.filename + 's', sourceRoot: this.sourceRoot })
    }

    concatString (aString) {
      this.atoms.push(aString);
    }

    concatSourceNode (aString, node, originalName) {
      if (node) {
        // console.log("Snippet: " + aString + ", line: " + node.loc.start.line + ", column: " + node.loc.start.column + ", source: " + node.loc.source);
        this.rootNode.add(new sourceMap.SourceNode(node.loc.start.line, node.loc.start.column, node.loc.source, aString, originalName));
      } else { this.rootNode.add(aString); }
      if (!this.notEmpty) { this.notEmpty = true; }
    }

    // '\n' will indent. '\n\0' will not indent. '\n\1' will indent one more then the current indent level.
    // '\n\-1' will indent one less then the current indent level. Numbers from 0-9 can me used.
    concatFormat (aString) {
      if (!aString) return
      const lines = aString.split('\n');
      const size = lines.length;
      if (size > 1) {
        this.concat(lines[0]);
        for (let i = 1; i < size; i++) {
          let line = lines[i];
          this.concat('\n');
          if (line.slice(0, 1) === '\\') {
            let numberLength = 1;
            let indent = line.slice(1, 1 + numberLength);
            if (indent === '-') {
              numberLength = 2;
              indent = line.slice(1, 1 + numberLength);
            }
            const indentationNumber = parseInt(indent);
            if (indentationNumber) {
              this.concat(indentationNumber > 0 ? indentation + Array(indentationNumber * indentationSpaces + 1).join(indentType) : indentation.substring(indentationSize * -indentationNumber));
            }
            line = line.slice(1 + numberLength);
          } else if (line || i === size - 1) {
            // Ident if there is something between line breaks or the last linebreak
            this.concat(this.indentation);
          }
          if (line) this.concat(line);
        }
      } else { this.concat(aString); }
    }

    isEmptyString () {
      return this.atoms.length !== 0
    }

    isEmptySourceNode () {
      return this.notEmpty
    }

    appendStringBufferString (stringBuffer) {
      // We can't do 'this.atoms.push.apply(this.atoms, stringBuffer.atoms);' as JavaScriptCore (WebKit) has a limit on number of arguments at 65536.
      // Other browsers also have simular limits.
      const thisAtoms = this.atoms;
      const thisLength = thisAtoms.length;
      const stringBufferAtoms = stringBuffer.atoms;
      const stringBufferLength = stringBufferAtoms.length;

      thisAtoms.length = thisLength + stringBufferLength;

      for (let i = 0; i < stringBufferLength; i++) {
        thisAtoms[thisLength + i] = stringBufferAtoms[i];
      }
    }

    appendStringBufferSourceNode (stringBuffer) {
      this.rootNode.add(stringBuffer.rootNode);
    }

    lengthString () {
      return this.atoms.length
    }

    lengthSourceNode () {
      return this.rootNode.children.length
    }

    removeAtIndexString (index) {
      this.atoms[index] = '';
    }

    removeAtIndexSourceNode (index) {
      this.rootNode.children[index] = '';
    }
  }

  // A optional argument can be given to further configure
  // the compiler. These options are recognized:

  const defaultOptions = {

    // Acorn options. For more information check objj-acorn.
    // We have a function here to create a new object every time we copy
    // the default options.
    acornOptions: function () { return Object.create(null) },

    // Turn on `sourceMap` generate a source map for the compiler file.
    sourceMap: false,

    // Turn on `sourceMapIncludeSource` will include the source code in the source map.
    sourceMapIncludeSource: false,

    // The compiler can do different passes.
    // 1: Parse and walk AST tree to collect file dependencies.
    // 2: Parse and walk to generate code.
    // Pass one is only for the Objective-J load and runtime.
    pass: 2,

    // Pass in class definitions. New class definitions in source file will be added here when compiling.
    classDefs: function () { return Object.create(null) },

    // Pass in protocol definitions. New protocol definitions in source file will be added here when compiling.
    protocolDefs: function () { return Object.create(null) },

    // Pass in typeDef definitions. New typeDef definitions in source file will be added here when compiling.
    typeDefs: function () { return Object.create(null) },

    // Turn off `generate` to make the compile copy the code from the source file (and replace needed parts)
    // instead of generate it from the AST tree. The preprocessor does not work if this is turn off as it alters
    // the AST tree and not the original source. We should deprecate this in the future.
    generate: true,

    // Turn on `generateObjJ` to generate Objecitve-J code instead of Javascript code. This can be used to beautify
    // the code.
    generateObjJ: false,

    // How many spaces for indentation when generation code.
    indentationSpaces: 4,

    // The type of indentation. Default is space. Can be changed to tab or any other string.
    indentationType: ' ',

    // There is a bug in Safari 2.0 that can't handle a named function declaration. See http://kangax.github.io/nfe/#safari-bug
    // Turn on `transformNamedFunctionDeclarationToAssignment` to make the compiler transform these.
    // We support this here as the old Objective-J compiler (Not a real compiler, Preprocessor.js) transformed
    // named function declarations to assignments.
    // Example: 'function f(x) { return x }' transforms to: 'f = function(x) { return x }'
    transformNamedFunctionDeclarationToAssignment: false,

    // Turn off `includeMethodFunctionNames` to remove function names on methods.
    includeMethodFunctionNames: true,

    // Turn off `includeMethodArgumentTypeSignatures` to remove type information on method arguments.
    includeMethodArgumentTypeSignatures: true,

    // Turn off `includeIvarTypeSignatures` to remove type information on ivars.
    includeIvarTypeSignatures: true,

    // Turn off `inlineMsgSendFunctions` to use message send functions. Needed to use message send decorators.
    inlineMsgSendFunctions: true,

    // `warning` includes the warnings that are turned on. It is just used for some warnings.
    warnings: [warningUnusedButSetVariable, warningShadowIvar, warningCreateGlobalInsideFunctionOrMethod, warningUnknownClassOrGlobal, warningUnknownIvarType],

    // An array of macro objects and/or text definitions may be passed in.
    // Definitions may be in one of two forms:
    //    macro
    //    macro=body
    macros: null

  };

  // We copy the options to a new object as we don't want to mess up incoming options when we start compiling.
  function setupOptions (opts) {
    const options = Object.create(null);
    for (const opt in defaultOptions) {
      if (opts && Object.prototype.hasOwnProperty.call(opts, opt)) {
        const incomingOpt = opts[opt];
        options[opt] = typeof incomingOpt === 'function' ? incomingOpt() : incomingOpt;
      } else if (Object.prototype.hasOwnProperty.call(defaultOptions, opt)) {
        const defaultOpt = defaultOptions[opt];
        options[opt] = typeof defaultOpt === 'function' ? defaultOpt() : defaultOpt;
      }
    }
    return options
  }

  class TypeDef {
    constructor (name) {
      this.name = name;
    }
  }

  // methodDef = {"types": types, "name": selector}
  class MethodDef {
    constructor (name, types) {
      this.name = name;
      this.types = types;
    }
  }

  // Both the ClassDef and ProtocolDef conforms to a 'protocol' (That we can't declare in Javascript).
  // Both Objects have the attribute 'protocols': Array of ProtocolDef that they conform to
  // Both also have the functions: addInstanceMethod, addClassMethod, getInstanceMethod and getClassMethod
  // classDef = {"className": aClassName, "superClass": superClass , "ivars": myIvars, "instanceMethods": instanceMethodDefs, "classMethods": classMethodDefs, "protocols": myProtocols};

  class ClassDef {
    constructor (isImplementationDeclaration, name, superClass, ivars, instanceMethods, classMethods, protocols) {
      this.name = name;
      if (superClass) { this.superClass = superClass; }
      if (ivars) { this.ivars = ivars; }
      if (isImplementationDeclaration) {
        this.instanceMethods = instanceMethods || Object.create(null);
        this.classMethods = classMethods || Object.create(null);
      }
      if (protocols) { this.protocols = protocols; }
    }

    addInstanceMethod (methodDef) {
      this.instanceMethods[methodDef.name] = methodDef;
    }

    addClassMethod (methodDef) {
      this.classMethods[methodDef.name] = methodDef;
    }

    listOfNotImplementedMethodsForProtocols (protocolDefs) {
      let resultList = [];
      const instanceMethods = this.getInstanceMethods();
      const classMethods = this.getClassMethods();

      for (let i = 0, size = protocolDefs.length; i < size; i++) {
        const protocolDef = protocolDefs[i];
        const protocolInstanceMethods = protocolDef.requiredInstanceMethods;
        const protocolClassMethods = protocolDef.requiredClassMethods;
        const inheritFromProtocols = protocolDef.protocols;

        if (protocolInstanceMethods) {
          for (const methodName in protocolInstanceMethods) {
            const methodDef = protocolInstanceMethods[methodName];
            if (!instanceMethods[methodName]) resultList.push({ methodDef, protocolDef });
          }
        }

        if (protocolClassMethods) {
          for (const methodName in protocolClassMethods) {
            const methodDef = protocolClassMethods[methodName];
            if (!classMethods[methodName]) resultList.push({ methodDef, protocolDef });
          }
        }

        if (inheritFromProtocols) { resultList = resultList.concat(this.listOfNotImplementedMethodsForProtocols(inheritFromProtocols)); }
      }

      return resultList
    }

    getInstanceMethod (name) {
      const instanceMethods = this.instanceMethods;

      if (instanceMethods) {
        const method = instanceMethods[name];

        if (method) { return method }
      }

      const superClass = this.superClass;

      if (superClass) { return superClass.getInstanceMethod(name) }

      return null
    }

    getClassMethod (name) {
      const classMethods = this.classMethods;
      if (classMethods) {
        const method = classMethods[name];

        if (method) { return method }
      }

      const superClass = this.superClass;

      if (superClass) { return superClass.getClassMethod(name) }

      return null
    }

    // Return a new Array with all instance methods
    getInstanceMethods () {
      const instanceMethods = this.instanceMethods;
      if (instanceMethods) {
        const superClass = this.superClass;
        const returnObject = Object.create(null);
        if (superClass) {
          const superClassMethods = superClass.getInstanceMethods();
          for (const methodName in superClassMethods) { returnObject[methodName] = superClassMethods[methodName]; }
        }

        for (const methodName in instanceMethods) { returnObject[methodName] = instanceMethods[methodName]; }

        return returnObject
      }

      return []
    }

    // Return a new Array with all class methods
    getClassMethods () {
      const classMethods = this.classMethods;
      if (classMethods) {
        const superClass = this.superClass;
        const returnObject = Object.create(null);
        if (superClass) {
          const superClassMethods = superClass.getClassMethods();
          for (const methodName in superClassMethods) { returnObject[methodName] = superClassMethods[methodName]; }
        }

        for (const methodName in classMethods) { returnObject[methodName] = classMethods[methodName]; }

        return returnObject
      }

      return []
    }
  }

  // Both the ClassDef and ProtocolDef conforms to a 'protocol' (That we can't declare in Javascript).
  // Both Objects have the attribute 'protocols': Array of ProtocolDef that they conform to
  // Both also have the functions: addInstanceMethod, addClassMethod, getInstanceMethod and getClassMethod
  // protocolDef = {"name": aProtocolName, "protocols": inheritFromProtocols, "requiredInstanceMethods": requiredInstanceMethodDefs, "requiredClassMethods": requiredClassMethodDefs};

  class ProtocolDef {
    constructor (name, protocols, requiredInstanceMethodDefs, requiredClassMethodDefs) {
      this.name = name;
      this.protocols = protocols;
      if (requiredInstanceMethodDefs) { this.requiredInstanceMethods = requiredInstanceMethodDefs; }
      if (requiredClassMethodDefs) { this.requiredClassMethods = requiredClassMethodDefs; }
    }

    addInstanceMethod = function (methodDef) {
      (this.requiredInstanceMethods || (this.requiredInstanceMethods = Object.create(null)))[methodDef.name] = methodDef;
    }

    addClassMethod = function (methodDef) {
      (this.requiredClassMethods || (this.requiredClassMethods = Object.create(null)))[methodDef.name] = methodDef;
    }

    getInstanceMethod = function (name) {
      const instanceMethods = this.requiredInstanceMethods;

      if (instanceMethods) {
        const method = instanceMethods[name];

        if (method) { return method }
      }

      const protocols = this.protocols;

      for (let i = 0, size = protocols.length; i < size; i++) {
        const protocol = protocols[i];
        const method = protocol.getInstanceMethod(name);

        if (method) { return method }
      }

      return null
    }

    getClassMethod = function (name) {
      const classMethods = this.requiredClassMethods;

      if (classMethods) {
        const method = classMethods[name];

        if (method) { return method }
      }

      const protocols = this.protocols;

      for (let i = 0, size = protocols.length; i < size; i++) {
        const protocol = protocols[i];
        const method = protocol.getClassMethod(name);

        if (method) { return method }
      }

      return null
    }
  }

  function wordsRegexp (words) {
    return new RegExp('^(?:' + words.replace(/ /g, '|') + ')$')
  }

  function isIdempotentExpression (node) {
    switch (node.type) {
      case 'Literal':
      case 'Identifier':
        return true

      case 'ArrayExpression':
        for (let i = 0; i < node.elements.length; ++i) {
          if (!isIdempotentExpression(node.elements[i])) { return false }
        }

        return true

      case 'DictionaryLiteral':
        for (let i = 0; i < node.keys.length; ++i) {
          if (!isIdempotentExpression(node.keys[i])) { return false }
          if (!isIdempotentExpression(node.values[i])) { return false }
        }

        return true

      case 'ObjectExpression':
        for (let i = 0; i < node.properties.length; ++i) {
          if (!isIdempotentExpression(node.properties[i].value)) { return false }
        }

        return true

      case 'FunctionExpression':
        for (let i = 0; i < node.params.length; ++i) {
          if (!isIdempotentExpression(node.params[i])) { return false }
        }

        return true

      case 'SequenceExpression':
        for (let i = 0; i < node.expressions.length; ++i) {
          if (!isIdempotentExpression(node.expressions[i])) { return false }
        }

        return true

      case 'UnaryExpression':
        return isIdempotentExpression(node.argument)

      case 'BinaryExpression':
        return isIdempotentExpression(node.left) && isIdempotentExpression(node.right)

      case 'ConditionalExpression':
        return isIdempotentExpression(node.test) && isIdempotentExpression(node.consequent) && isIdempotentExpression(node.alternate)

      case 'MemberExpression':
        return isIdempotentExpression(node.object) && (!node.computed || isIdempotentExpression(node.property))

      case 'Dereference':
        return isIdempotentExpression(node.expr)

      case 'Reference':
        return isIdempotentExpression(node.element)

      default:
        return false
    }
  }

  // We do not allow dereferencing of expressions with side effects because we might need to evaluate the expression twice in certain uses of deref, which is not obvious when you look at the deref operator in plain code.
  function checkCanDereference (st, node) {
    if (!isIdempotentExpression(node)) { throw st.compiler.error_message('Dereference of expression with side effects', node) }
  }

  // Surround expression with parentheses
  function surroundExpression (c) {
    return function (node, st, override) {
      st.compiler.jsBuffer.concat('(');
      c(node, st, override);
      st.compiler.jsBuffer.concat(')');
    }
  }

  const operatorPrecedence = {
    // MemberExpression
    // These two are never used as they are a MemberExpression with the attribute 'computed' which tells what operator it uses.
    // ".": 0, "[]": 0,
    // NewExpression
    // This is never used.
    // "new": 1,
    // All these are UnaryExpression or UpdateExpression and never used.
    // "!": 2, "~": 2, "-": 2, "+": 2, "++": 2, "--": 2, "typeof": 2, "void": 2, "delete": 2,
    // BinaryExpression
    '*': 3,
    '/': 3,
    '%': 3,
    '+': 4,
    '-': 4,
    '<<': 5,
    '>>': 5,
    '>>>': 5,
    '<': 6,
    '<=': 6,
    '>': 6,
    '>=': 6,
    in: 6,
    instanceof: 6,
    '==': 7,
    '!=': 7,
    '===': 7,
    '!==': 7,
    '&': 8,
    '^': 9,
    '|': 10,
    // LogicalExpression
    '&&': 11,
    '||': 12,
    '??': 13
    // ConditionalExpression
    // AssignmentExpression
  };

  const expressionTypePrecedence = {
    MemberExpression: 1,
    CallExpression: 1,
    NewExpression: 1,
    ChainExpression: 2,
    FunctionExpression: 3,
    ArrowFunctionExpression: 3,
    ImportExpression: 3,
    UnaryExpression: 4,
    UpdateExpression: 4,
    BinaryExpression: 5,
    LogicalExpression: 6,
    ConditionalExpression: 7,
    AssignmentExpression: 8
  };

  function ignore (_node, _st, _c) { }

  const pass1 = walk__default["default"].make({
    ImportStatement: function (node, st, c) {
      const urlString = node.filename.value;

      st.compiler.dependencies.push({ url: urlString, isLocal: node.localfilepath });
      // st.compiler.dependencies.push(typeof FileDependency !== 'undefined' ? new FileDependency(typeof CFURL !== 'undefined' ? new CFURL(urlString) : urlString, node.localfilepath) : urlString);
    },
    TypeDefStatement: ignore,
    ClassStatement: ignore,
    ClassDeclarationStatement: ignore,
    MessageSendExpression: ignore,
    GlobalStatement: ignore,
    ProtocolDeclarationStatement: ignore,
    ArrayLiteral: ignore,
    Reference: ignore,
    DictionaryLiteral: ignore,
    Dereference: ignore,
    SelectorLiteralExpression: ignore
  });

  // Returns true if subNode has higher precedence the the root node.
  // If the subNode is the right (as in left/right) subNode
  function nodePrecedence (node, subNode, right) {
    const nodeType = node.type;
    const nodePrecedence = expressionTypePrecedence[nodeType] || -1;
    const subNodePrecedence = expressionTypePrecedence[subNode.type] || -1;
    let nodeOperatorPrecedence;
    let subNodeOperatorPrecedence;
    return nodePrecedence < subNodePrecedence || (nodePrecedence === subNodePrecedence && isLogicalBinary.test(nodeType) && ((nodeOperatorPrecedence = operatorPrecedence[node.operator]) < (subNodeOperatorPrecedence = operatorPrecedence[subNode.operator]) || (right && nodeOperatorPrecedence === subNodeOperatorPrecedence)))
  }

  // Used for arrow functions. Checks if the parameter list needs parentheses.
  function mustHaveParentheses (paramList) {
    for (const param of paramList) {
      if (param.type !== 'Identifier') {
        return true
      }
    }
    return paramList.length > 1 || paramList.length === 0
  }

  const reservedIdentifiers = wordsRegexp('self _cmd __filename undefined localStorage arguments');
  const wordPrefixOperators = wordsRegexp('delete in instanceof new typeof void');
  const isLogicalBinary = wordsRegexp('LogicalExpression BinaryExpression');

  const pass2 = walk__default["default"].make({
    Program: function (node, st, c) {
      for (let i = 0; i < node.body.length; ++i) {
        c(node.body[i], st, 'Statement');
      }

      // Check maybe warnings
      const maybeWarnings = st.maybeWarnings();
      if (maybeWarnings) {
        for (let i = 0; i < maybeWarnings.length; i++) {
          const maybeWarning = maybeWarnings[i];
          if (maybeWarning.checkIfWarning(st)) {
            st.compiler.addWarning(maybeWarning.message);
          }
        }
      }
    },
    BlockStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      const isDecl = st.isDecl;
      if (isDecl != null) {
        delete st.isDecl;
      }

      const endOfScopeBody = st.endOfScopeBody;
      if (endOfScopeBody) {
        delete st.endOfScopeBody;
      }

      const skipIndentation = st.skipIndentation;
      if (skipIndentation) {
        delete st.skipIndentation;
      } else {
        buffer.concat(compiler.indentation.substring(compiler.indentationSize));
      }

      buffer.concat('{\n', node);
      const inner = endOfScopeBody ? st : new BlockScope(st);
      for (let i = 0; i < node.body.length; ++i) {
        if (node.body[i].type === 'BlockStatement') {
          compiler.indentation += compiler.indentStep;
          c(node.body[i], inner, 'Statement');
          compiler.indentation = compiler.indentation.substring(compiler.indentationSize);
        } else {
          c(node.body[i], inner, 'Statement');
        }
      }
      !endOfScopeBody && inner.variablesNotReadWarnings();
      const maxReceiverLevel = st.maxReceiverLevel;
      if (endOfScopeBody && maxReceiverLevel) {
        buffer.concat(compiler.indentation);
        buffer.concat('var ');
        for (let i = 0; i < maxReceiverLevel; i++) {
          if (i) buffer.concat(', ');
          buffer.concat('___r');
          buffer.concat((i + 1) + '');
        }
        buffer.concat(';\n');
      }

      // Simulate a node for the last curly bracket
      // var endNode = node.loc && { loc: { start: { line : node.loc.end.line, column: node.loc.end.column}}, source: node.loc.source};
      buffer.concat(compiler.indentation.substring(compiler.indentationSize));
      buffer.concat('}', node);
      if (st.isDefaultExport) buffer.concat(';');
      if (!skipIndentation && isDecl !== false) {
        buffer.concat('\n');
      }
      st.indentBlockLevel--;
    },
    ExpressionStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      if (node.expression.type === 'Reference') throw compiler.error_message("Can't have reference of expression as a statement", node.expression)
      if ((node.expression.type === 'AssignmentExpression' && node.expression.left.type === 'ObjectPattern') || node.expression.type === 'FunctionExpression' || node.expression.type === 'ObjectExpression' || (node.expression.type === 'BinaryExpression' && node.expression.left.type === 'FunctionExpression') || (node.expression.type === 'Literal' && node.expression.value === 'use strict' && !node.directive)) {
        surroundExpression(c)(node.expression, st, 'Expression');
      } else {
        c(node.expression, st, 'Expression');
      }
      buffer.concat(';\n', node);
    },
    IfStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      // Keep the 'else' and 'if' on the same line if it is an 'else if'
      if (!st.superNodeIsElse) { buffer.concat(st.compiler.indentation); } else { delete st.superNodeIsElse; }
      buffer.concat('if (', node);
      c(node.test, st, 'Expression');
      // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
      buffer.concat(')');
      if (node.consequent.type !== 'EmptyStatement') buffer.concat('\n');
      st.compiler.indentation += st.compiler.indentStep;
      c(node.consequent, st, 'Statement');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      const alternate = node.alternate;
      if (alternate) {
        const alternateNotIf = alternate.type !== 'IfStatement';
        const emptyStatement = alternate.type === 'EmptyStatement';
        buffer.concat(st.compiler.indentation);
        // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
        buffer.concat(alternateNotIf ? emptyStatement ? 'else' : 'else\n' : 'else ', node);
        if (alternateNotIf) { st.compiler.indentation += st.compiler.indentStep; } else { st.superNodeIsElse = true; }

        c(alternate, st, 'Statement');
        if (alternateNotIf) st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      }
    },
    LabeledStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      c(node.label, st, 'VariablePattern');
      buffer.concat(': ', node);
      c(node.body, st, 'Statement');
    },
    BreakStatement: function (node, st, c) {
      const compiler = st.compiler;
      const label = node.label;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      if (label) {
        buffer.concat('break ', node);
        c(label, st, 'VariablePattern');
        buffer.concat(';\n');
      } else { buffer.concat('break;\n', node); }
    },
    ContinueStatement: function (node, st, c) {
      const compiler = st.compiler;
      const label = node.label;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      if (label) {
        buffer.concat('continue ', node);
        c(label, st, 'VariablePattern');
        buffer.concat(';\n');
      } else { buffer.concat('continue;\n', node); }
    },
    WithStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('with(', node);
      c(node.object, st, 'Expression');
      buffer.concat(')\n', node);
      st.compiler.indentation += st.compiler.indentStep;
      c(node.body, st, 'Statement');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
    },
    SwitchStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('switch(', node);
      c(node.discriminant, st, 'Expression');
      buffer.concat(') {\n');
      st.compiler.indentation += st.compiler.indentStep;
      for (let i = 0; i < node.cases.length; ++i) {
        const cs = node.cases[i];
        if (cs.test) {
          buffer.concat(st.compiler.indentation);
          buffer.concat('case ');
          c(cs.test, st, 'Expression');
          buffer.concat(':\n');
        } else { buffer.concat('default:\n'); }
        st.compiler.indentation += st.compiler.indentStep;
        for (let j = 0; j < cs.consequent.length; ++j) { c(cs.consequent[j], st, 'Statement'); }
        st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      }
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      buffer.concat(st.compiler.indentation);
      buffer.concat('}\n');
    },
    ReturnStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('return', node);
      if (node.argument) {
        buffer.concat(' ');
        c(node.argument, st, 'Expression');
      }
      buffer.concat(';\n');
    },
    ThrowStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('throw', node);
      buffer.concat(' ');
      c(node.argument, st, 'Expression');
      buffer.concat(';\n');
    },
    TryStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('try', node);
      buffer.concat(' ');
      st.compiler.indentation += st.compiler.indentStep;
      st.skipIndentation = true;
      c(node.block, st, 'Statement');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      if (node.handler) {
        const handler = node.handler;
        const inner = new Scope(st);
        const param = handler.param;
        const name = param?.name;
        if (name) inner.vars[name] = { type: 'catch clause', node: param };
        buffer.concat('\n');
        buffer.concat(st.compiler.indentation);
        buffer.concat('catch');
        if (param) {
          buffer.concat('(');
          c(param, st, 'Pattern');
          buffer.concat(') ');
        }
        st.compiler.indentation += st.compiler.indentStep;
        inner.skipIndentation = true;
        inner.endOfScopeBody = true;
        c(handler.body, inner, 'BlockStatement');
        inner.variablesNotReadWarnings();
        st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
        inner.copyAddedSelfToIvarsToParent();
      }
      if (node.finalizer) {
        buffer.concat('\n');
        buffer.concat(st.compiler.indentation);
        buffer.concat('finally ');
        st.compiler.indentation += st.compiler.indentStep;
        st.skipIndentation = true;
        c(node.finalizer, st, 'Statement');
        st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      }
      buffer.concat('\n');
    },
    WhileStatement: function (node, st, c) {
      const compiler = st.compiler;
      const body = node.body;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('while (', node);
      c(node.test, st, 'Expression');
      // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
      buffer.concat(')');
      if (node.body.type !== 'EmptyStatement') buffer.concat('\n');
      st.compiler.indentation += st.compiler.indentStep;
      c(body, st, 'Statement');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
    },
    DoWhileStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('do\n', node);
      st.compiler.indentation += st.compiler.indentStep;
      c(node.body, st, 'Statement');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      buffer.concat(st.compiler.indentation);
      buffer.concat('while (');
      c(node.test, st, 'Expression');
      buffer.concat(');\n');
    },
    ForStatement: function (node, st, c) {
      const compiler = st.compiler;
      const body = node.body;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('for (', node);
      if (node.init) c(node.init, st, 'ForInit');
      buffer.concat('; ');
      if (node.test) c(node.test, st, 'Expression');
      buffer.concat('; ');
      if (node.update) c(node.update, st, 'Expression');
      // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
      buffer.concat(')');
      if (node.body.type !== 'EmptyStatement') buffer.concat('\n');
      st.compiler.indentation += st.compiler.indentStep;
      c(body, st, 'Statement');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
    },
    ForInStatement: function (node, st, c) {
      const compiler = st.compiler;
      const body = node.body;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('for (', node);
      c(node.left, st, 'ForInit');
      buffer.concat(' in ');
      c(node.right, st, 'Expression');
      // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
      buffer.concat(body.type === 'EmptyStatement' ? ')\n' : ')\n');
      st.compiler.indentation += st.compiler.indentStep;
      c(body, st, 'Statement');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
    },
    ForOfStatement: function (node, st, c) { // TODO: Fix code duplication with 'for in'-
      const compiler = st.compiler;
      const body = node.body;
      const buffer = compiler.jsBuffer;
      buffer.concat('for', node);
      if (node.await) buffer.concat(' await ');
      buffer.concat('(');
      c(node.left, st, 'ForInit');
      buffer.concat(' of ');
      c(node.right, st, 'Expression');
      // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
      buffer.concat(body.type === 'EmptyStatement' ? ')\n' : ')\n');
      st.compiler.indentation += st.compiler.indentStep;
      c(body, st, 'Statement');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
    },
    ForInit: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      if (node.type === 'VariableDeclaration') {
        st.isFor = true;
        c(node, st);
        delete st.isFor;
      } else if (node.type === 'BinaryExpression' && node.operator === 'in') {
        buffer.concat('(');
        c(node, st, 'Expression');
        buffer.concat(')');
      } else {
        c(node, st, 'Expression');
      }
    },
    DebuggerStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('debugger;\n', node);
    },
    Function: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const inner = new FunctionScope(st);
      const decl = node.type === 'FunctionDeclaration';
      const id = node.id;

      inner.isDecl = decl;
      for (let i = 0; i < node.params.length; ++i) { inner.vars[node.params[i].name] = { type: 'argument', node: node.params[i] }; }
      buffer.concat(st.compiler.indentation);
      if (id) {
        const name = id.name;
        (decl ? st : inner).vars[name] = { type: decl ? 'function' : 'function name', node: id };
        if (!st.skipFunctionKeyword && compiler.transformNamedFunctionDeclarationToAssignment) {
          buffer.concat(name);
          buffer.concat(' = ');
        }
      }
      if (st.isDefaultExport && !decl) buffer.concat('(');
      const prefix = [];
      if (st.methodPrefix?.length) {
        prefix.push(...st.methodPrefix);
      }
      if (node.async) prefix.push('async');
      if (!st.skipFunctionKeyword) {
        prefix.push('function');
      }
      if (node.generator) prefix.push('*');
      buffer.concat(prefix.join(' '));
      if ((st.skipFunctionKeyword || !compiler.transformNamedFunctionDeclarationToAssignment) && id) {
        buffer.concat(' ');
        if (st.isComputed) buffer.concat('[');
        c(id, st);
        if (st.isComputed) buffer.concat(']');
      }
      buffer.concat('(');
      for (let i = 0; i < node.params.length; ++i) {
        if (i) { buffer.concat(', '); }
        if (node.params[i].type === 'RestElement') {
          c(node.params[i], st, 'RestElement');
        } else {
          c(node.params[i], st, 'Pattern');
        }
      }
      buffer.concat(')\n');
      st.compiler.indentation += st.compiler.indentStep;
      inner.endOfScopeBody = true;
      c(node.body, inner, 'Statement');
      if (st.isDefaultExport && !decl) buffer.concat(')');
      inner.variablesNotReadWarnings();
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      inner.copyAddedSelfToIvarsToParent();
    },
    ObjectPattern: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('{', node);
      let isFirst = true;
      for (const prop of node.properties) {
        if (!isFirst) {
          buffer.concat(', ');
        } else {
          isFirst = false;
        }
        if (prop.type === 'Property') {
          if (prop.shorthand && prop.value.type === 'AssignmentPattern') {
            c(prop.value, st);
          } else {
            if (prop.computed) buffer.concat('[');
            c(prop.key, st, 'Pattern');
            if (prop.computed) buffer.concat(']');
            if (!prop.shorthand) {
              buffer.concat(': ');
              c(prop.value, st, 'Pattern');
            }
          }
        } else {
          c(prop, st);
        }
      }
      buffer.concat('}');
    },
    RestElement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('...');
      c(node.argument, st, 'Pattern');
    },
    RestPattern: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('...');
      c(node.argument, st, 'Pattern');
    },
    EmptyStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(';\n');
    },
    VariableDeclaration: function (node, st, c) {
      const identifiersFromIdentifier = (id, currentResult) => {
        switch (id.type) {
          case "Identifier":
            currentResult.push(id);
            break
          case "ObjectPattern":
            currentResult.concat(id.properties.reduce( (result, prop) => result.concat(identifiersFromIdentifier(prop.type === 'RestElement' ? prop.argument : prop.value, currentResult)), []));
            break
          case "ArrayPattern":
            currentResult.concat(id.elements.reduce( (result, element) => element != null ? result.concat(identifiersFromIdentifier(element, currentResult)) : result, []));
            break
          case "AssignmentPattern":
            currentResult.concat(identifiersFromIdentifier(id.left, currentResult));
            break
        }
        return currentResult
      };
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const isVar = node.kind === 'var';
      const varScope = isVar ? st.getVarScope() : st;

      if (!st.isFor) buffer.concat(compiler.indentation);
      buffer.concat(node.kind + ' ', node);
      let isFirst = true;
      for (const decl of node.declarations) {
        let identifiers = identifiersFromIdentifier(decl.id, []);

        if (identifiers) for (const identifierNode of identifiers) {
          const possibleHoistedVariable = isVar && varScope.possibleHoistedVariables?.[identifierNode.name];
          const variableDeclaration = { type: node.kind, node: identifierNode, isRead: (possibleHoistedVariable ? possibleHoistedVariable.isRead : 0) };

          // Make sure we count the access for this varaible if it is hoisted.
          // Check if this variable has already been accessed above this declaration
          if (possibleHoistedVariable) {
            // 'variableDeclaration' is already marked as read. This was done by adding the already read amount above.

            // Substract the same amount from possible local variable higher up in the hierarchy that is shadowed by this declaration
            if (possibleHoistedVariable.variable) {
              possibleHoistedVariable.variable.isRead -= possibleHoistedVariable.isRead;
            }
            // Remove it as we don't need to care about this variable anymore.
            varScope.possibleHoistedVariables[identifierNode.name] = null;
          }
          varScope.vars[identifierNode.name] = variableDeclaration;
        }

        if (!isFirst) {
          if (st.isFor) { buffer.concat(', '); } else {
            buffer.concat(',\n');
            buffer.concat(compiler.indentation);
            buffer.concat('    ');
          }
        }

        c(decl.id, st, 'Pattern');
        if (decl.init) {
          buffer.concat(' = ');
          c(decl.init, st, 'Expression');
        }
        // FIXME: Extract to function
        // Here we check back if a ivar with the same name exists and if we have prefixed 'self.' on previous uses.
        // If this is the case we have to remove the prefixes and issue a warning that the variable hides the ivar.
        if (st.addedSelfToIvars) {
          if (identifiers) for (const identifierNode of identifiers) {
            const addedSelfToIvar = st.addedSelfToIvars[identifierNode.name];
            if (addedSelfToIvar) {
              const size = addedSelfToIvar.length;
              for (let i = 0; i < size; i++) {
                const dict = addedSelfToIvar[i];
                buffer.removeAtIndex(dict.index);
                if (compiler.options.warnings.includes(warningShadowIvar)) compiler.addWarning(createMessage("Local declaration of '" + identifierNode.name + "' hides instance variable", dict.node, compiler.source));
              }
              // Add a read mark to the local variable for each time it is used.
              const variableDeclaration = varScope.vars[identifierNode.name];
              variableDeclaration.isRead += size;
              // Remove the variable from list of instance variable uses.
              st.addedSelfToIvars[identifierNode.name] = [];
            }
          }
        }
        if (isFirst) isFirst = false;
      }
      if (!st.isFor) buffer.concat(';\n', node); // Don't add ';' if this is a for statement but do it if this is a statement
    },
    ThisExpression: function (node, st, c) {
      const compiler = st.compiler;

      compiler.jsBuffer.concat('this', node);
    },
    ArrayExpression: function (node, st, c) {
      const compiler = st.compiler;

      const buffer = compiler.jsBuffer;
      buffer.concat('[', node);

      for (let i = 0; i < node.elements.length; ++i) {
        const elt = node.elements[i];

        if (i !== 0) { buffer.concat(', '); }

        if (elt) c(elt, st, 'Expression');
      }
      buffer.concat(']');
    },
    ObjectExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('{', node);
      let isFirst = true;
      for (const prop of node.properties) {
        if (!isFirst) {
          buffer.concat(', ');
        } else {
          isFirst = false;
        }
        c(prop, st);
      }
      buffer.concat('}');
    },
    Property: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      if (node.value?.type === 'AssignmentPattern' && node.shorthand) {
        c(node.value, st, 'AssignmentPattern');
      } else if (node.kind === 'get' || node.kind === 'set' || node.method) {
        buffer.concat((node.method ? '' : node.kind) + ' ');
        node.value.id = node.key;
        st.isComputed = node.computed;
        st.skipFunctionKeyword = true;
        c(node.value, st, 'Expression');
        delete st.skipFunctionKeyword;
        delete st.isComputed;
      } else {
        if (node.computed) buffer.concat('[');
        st.isPropertyKey = true;
        c(node.key, st, 'Expression');
        delete st.isPropertyKey;
        if (node.computed) buffer.concat(']');
        if (!node.shorthand) {
          buffer.concat(': ');
        }
        if (!node.shorthand) c(node.value, st, 'Expression');
      }
    },
    StaticBlock: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(st.compiler.indentation);
      buffer.concat('static');
      buffer.concat('{');
      for (let i = 0; i < node.body.length; ++i) {
        c(node.body[i], st, 'Statement');
      }
      buffer.concat('}');
    },
    SpreadElement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('...');
      c(node.argument, st);
    },
    SequenceExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('(', node);
      for (let i = 0; i < node.expressions.length; ++i) {
        if (i !== 0) { buffer.concat(', '); }
        c(node.expressions[i], st, 'Expression');
      }
      buffer.concat(')');
    },
    UnaryExpression: function (node, st, c) {
      const compiler = st.compiler;
      const argument = node.argument;
      const buffer = compiler.jsBuffer;
      if (node.prefix) {
        buffer.concat(node.operator, node);
        if (wordPrefixOperators.test(node.operator)) { buffer.concat(' '); }
        (nodePrecedence(node, argument) ? surroundExpression(c) : c)(argument, st, 'Expression');
      } else {
        (nodePrecedence(node, argument) ? surroundExpression(c) : c)(argument, st, 'Expression');
        buffer.concat(node.operator);
      }
    },
    UpdateExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      if (node.argument.type === 'Dereference') {
        checkCanDereference(st, node.argument);

        // @deref(x)++ and ++@deref(x) require special handling.

        // Output the dereference function, "(...)(z)"
        buffer.concat((node.prefix ? '' : '(') + '(');

        // The thing being dereferenced.
        c(node.argument.expr, st, 'Expression');
        buffer.concat(')(');

        c(node.argument, st, 'Expression');
        buffer.concat(' ' + node.operator.substring(0, 1) + ' 1)' + (node.prefix ? '' : node.operator === '++' ? ' - 1)' : ' + 1)'));

        return
      }

      if (node.prefix) {
        buffer.concat(node.operator, node);
        if (wordPrefixOperators.test(node.operator)) { buffer.concat(' '); }
        (nodePrecedence(node, node.argument) ? surroundExpression(c) : c)(node.argument, st, 'Expression');
      } else {
        (nodePrecedence(node, node.argument) ? surroundExpression(c) : c)(node.argument, st, 'Expression');
        buffer.concat(node.operator);
      }
    },
    BinaryExpression: function (node, st, c) {
      const compiler = st.compiler;
      if (node.operator === '**' || node.left.type === 'ArrowFunctionExpression') {
        surroundExpression(c)(node.left, st, 'Expression');
      } else {
        (nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, 'Expression');
      }
      const buffer = compiler.jsBuffer;
      buffer.concat(' ');
      buffer.concat(node.operator, node);
      buffer.concat(' ');
      (nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, 'Expression');
    },
    LogicalExpression: function (node, st, c) {
      const compiler = st.compiler;
      if (node.operator === '??') {
        surroundExpression(c)(node.left, st, 'Expression');
      } else {
        (nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, 'Expression');
      }
      const buffer = compiler.jsBuffer;
      buffer.concat(' ');
      buffer.concat(node.operator);
      buffer.concat(' ');
      if (node.operator === '??') {
        surroundExpression(c)(node.right, st, 'Expression');
      } else {
        (nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, 'Expression');
      }
    },
    ParenthesizedExpression: function (node, st, c) {
      const buffer = st.compiler.jsBuffer;
      buffer.concat('(');
      c(node.expression, st, 'Expression');
      buffer.concat(')');
    },
    AssignmentExpression: function (node, st, c) {
      const compiler = st.compiler;
      let saveAssignment = st.assignment;
      const buffer = compiler.jsBuffer;

      if (node.left.type === 'Dereference') {
        checkCanDereference(st, node.left);

        // @deref(x) = z    -> x(z) etc

        // Output the dereference function, "(...)(z)"
        buffer.concat('(', node);
        // What's being dereferenced could itself be an expression, such as when dereferencing a deref.
        c(node.left.expr, st, 'Expression');
        buffer.concat(')(');

        // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
        if (node.operator !== '=') {
          // Output the whole .left, not just .left.expr.
          c(node.left, st, 'Expression');
          buffer.concat(' ' + node.operator.substring(0, 1) + ' ');
        }

        c(node.right, st, 'Expression');
        buffer.concat(')');

        return
      }

      saveAssignment = st.assignment;
      const nodeLeft = node.left;

      st.assignment = true;
      if (nodeLeft.type === 'Identifier' && nodeLeft.name === 'self') {
        const lVar = st.getLvar('self', true);
        if (lVar) {
          const lvarScope = lVar.scope;
          if (lvarScope) { lvarScope.assignmentToSelf = true; }
        }
      }
      (nodePrecedence(node, nodeLeft) ? surroundExpression(c) : c)(nodeLeft, st, 'Expression');
      buffer.concat(' ');
      buffer.concat(node.operator);
      buffer.concat(' ');
      st.assignment = saveAssignment;
      (nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, 'Expression');
      const varScope = st.getVarScope();
      if (varScope.isRootScope() && nodeLeft.type === 'Identifier' && !varScope.getLvar(nodeLeft.name)) { varScope.vars[nodeLeft.name] = { type: 'global', node: nodeLeft }; }
    },
    AssignmentPattern: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      c(node.left, st, 'Pattern');
      buffer.concat(' = ');
      c(node.right, st, 'Expression');
    },
    ArrayPattern: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('[');
      let isFirst = true;
      for (const element of node.elements) {
        if (!isFirst || element == null) {
          buffer.concat(', ');
        } else {
          isFirst = false;
        }
        if (element != null) c(element, st, "Pattern");
      }
      buffer.concat(']');
    },
    VariablePattern: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat(node.name);
    },
    TemplateLiteral: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('`');
      let i;
      for (i = 0; i < node.expressions.length; i++) {
        buffer.concat(node.quasis[i].value.raw);
        buffer.concat('${');
        c(node.expressions[i], st);
        buffer.concat('}');
      }
      buffer.concat(node.quasis[i].value.raw);
      buffer.concat('`');
    },
    TaggedTemplateExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      if (node.tag.type === 'ChainExpression') buffer.concat('(');
      c(node.tag, st, 'Expression');
      if (node.tag.type === 'ChainExpression') buffer.concat(')');
      c(node.quasi, st, 'Expression');
    },
    ConditionalExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      (nodePrecedence(node, node.test) ? surroundExpression(c) : c)(node.test, st, 'Expression');
      buffer.concat(' ? ');
      c(node.consequent, st, 'Expression');
      buffer.concat(' : ');
      c(node.alternate, st, 'Expression');
    },
    NewExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const nodeArguments = node.arguments;
      buffer.concat('new ', node);
      (nodePrecedence(node, node.callee) ? surroundExpression(c) : c)(node.callee, st, 'Expression');
      buffer.concat('(');
      if (nodeArguments) {
        for (let i = 0, size = nodeArguments.length; i < size; ++i) {
          if (i) { buffer.concat(', '); }
          c(nodeArguments[i], st, 'Expression');
        }
      }
      buffer.concat(')');
    },
    CallExpression: function (node, st, c) {
      const compiler = st.compiler;
      const nodeArguments = node.arguments;
      const callee = node.callee;
      const buffer = compiler.jsBuffer;

      // If call to function 'eval' we assume that 'self' can be altered and from this point
      // we check if 'self' is null before 'objj_msgSend' is called with 'self' as receiver.
      if (callee.type === 'Identifier' && callee.name === 'eval') {
        const selfLvar = st.getLvar('self', true);
        if (selfLvar) {
          const selfScope = selfLvar.scope;
          if (selfScope) {
            selfScope.assignmentToSelf = true;
          }
        }
      }
      (nodePrecedence(node, callee) ? surroundExpression(c) : c)(callee, st, 'Expression');
      if (node.optional) buffer.concat('?.');
      buffer.concat('(');
      if (nodeArguments) {
        for (let i = 0, size = nodeArguments.length; i < size; ++i) {
          if (i) { buffer.concat(', '); }
          c(nodeArguments[i], st, 'Expression');
        }
      }
      buffer.concat(')');
    },
    MemberExpression: function (node, st, c) {
      const compiler = st.compiler;
      const computed = node.computed;
      (nodePrecedence(node, node.object) ? surroundExpression(c) : c)(node.object, st, 'Expression');
      let s = '';
      if (node.optional && node.computed) {
        s = '?.[';
      } else if (node.optional) {
        s = '?.';
      } else if (node.computed) {
        s = '[';
      } else {
        s = '.';
      }
      compiler.jsBuffer.concat(s);
      st.secondMemberExpression = !computed;
      // No parentheses when it is computed, '[' and ']' are the same thing.
      (!computed && nodePrecedence(node, node.property) ? surroundExpression(c) : c)(node.property, st, 'Expression');
      st.secondMemberExpression = false;
      if (computed) { compiler.jsBuffer.concat(']'); }
    },
    ChainExpression: function (node, st, c) {
      c(node.expression, st);
    },
    AwaitExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('await', node);
      if (node.argument) {
        buffer.concat(' ');
        buffer.concat('(');
        c(node.argument, st, 'Expression');
        buffer.concat(')');
      }
    },
    ArrowFunctionExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const inner = new FunctionScope(st);
      inner.isDecl = false;
      for (let i = 0; i < node.params.length; ++i) { inner.vars[node.params[i].name] = { type: 'argument', node: node.params[i] }; }
      if (node.async) buffer.concat('async ');
      const needParentheses = mustHaveParentheses(node.params);
      if (needParentheses) buffer.concat('(');
      let isFirst = true;
      for (const param of node.params) {
        if (isFirst) {
          isFirst = false;
        } else {
          buffer.concat(', ');
        }
        c(param, st, 'Pattern');
      }
      if (needParentheses) buffer.concat(')');
      buffer.concat(' => ');
      if (node.expression) {
        if ((node.body.type === 'AssignmentExpression' && node.body.left.type === 'ObjectPattern') || node.body.type === 'FunctionExpression' || node.body.type === 'ObjectExpression') {
          surroundExpression(c)(node.body, inner, 'Expression');
        } else {
          c(node.body, inner, 'Expression');
        }
      } else {
        inner.skipIndentation = true;
        inner.endOfScopeBody = true;
        st.compiler.indentation += st.compiler.indentStep;
        c(node.body, inner, 'BlockStatement');
        st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      }
      inner.variablesNotReadWarnings();
      inner.copyAddedSelfToIvarsToParent();
    },
    Identifier: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const identifier = node.name;

      if (st.isPropertyKey) {
        buffer.concat(identifier, node, identifier === 'self' ? 'self' : null);
        return
      }

      let lvarScope = st.getLvarScope(identifier, true); // Only look inside method/function scope
      let lvar = lvarScope.vars?.[identifier];

      if (!st.secondMemberExpression && st.currentMethodType() === '-') {
        const ivar = compiler.getIvarForClass(identifier, st);
        if (ivar) {
          if (lvar) {
            if (compiler.options.warnings.includes(warningShadowIvar)) compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", node, compiler.source));
          } else {
            // Save the index in where the "self." string is stored and the node.
            // These will be used if we find a variable declaration that is hoisting this identifier.
            ((st.addedSelfToIvars || (st.addedSelfToIvars = Object.create(null)))[identifier] || (st.addedSelfToIvars[identifier] = [])).push({ node, index: buffer.length() });
            buffer.concat('self.', node);
          }
        } else if (!reservedIdentifiers.test(identifier)) { // Don't check for warnings if it is a reserved word like self, localStorage, _cmd, etc...
          let message;
          const classOrGlobal = typeof global[identifier] !== 'undefined' || (typeof window !== 'undefined' && typeof window[identifier] !== 'undefined') || compiler.getClassDef(identifier);
          const globalVar = st.getLvar(identifier);
          if (classOrGlobal && (!globalVar || globalVar.type !== 'class')) ; else if (!globalVar) {
            if (st.assignment && compiler.options.warnings.includes(warningCreateGlobalInsideFunctionOrMethod)) {
              message = new GlobalVariableMaybeWarning("Creating global variable inside function or method '" + identifier + "'", node, compiler.source);
              // Turn off these warnings for this identifier, we only want one.
              st.vars[identifier] = { type: 'remove global warning', node };
            } else if (compiler.options.warnings.includes(warningUnknownClassOrGlobal)) {
              message = new GlobalVariableMaybeWarning("Using unknown class or uninitialized global variable '" + identifier + "'", node, compiler.source);
            }
          }
          if (message) { st.addMaybeWarning(message); }
        }
      }
      if (!(st.assignment && st.secondMemberExpression)) {
        if (lvar) {
          lvar.isRead++;
        } else {
          // If the var is not declared in current var scope (function scope) we need to save which var it is as it can be hoisted.
          // First check if the variable is declared higher up in the scope hierarchy
          lvarScope = lvarScope.getLvarScope(identifier);
          lvar = lvarScope.vars && lvarScope.vars[identifier];
          // We will mark it as read.
          if (lvar) {
            lvar.isRead++;
          }

          // The variable can be declared later on in this function / method scope.
          // It can also be declared later on in a higher scope.
          // We create a list of possible variables that will be used if it is declared.
          // We collect how many times the variable is read and a reference to a possible variable in a
          let possibleHoistedVariable = (lvarScope.possibleHoistedVariables || (lvarScope.possibleHoistedVariables = Object.create(null)))[identifier];

          if (possibleHoistedVariable == null) {
            possibleHoistedVariable = { isRead: 1 };
            lvarScope.possibleHoistedVariables[identifier] = possibleHoistedVariable;
          } else {
            possibleHoistedVariable.isRead++;
          }

          if (lvar) {
            // If the var and scope are already set it should not be different from what we found now.
            if ((possibleHoistedVariable.variable && possibleHoistedVariable.variable !== lvar) || (possibleHoistedVariable.varScope && possibleHoistedVariable.varScope !== lvarScope)) {
              throw new Error('Internal inconsistency, var or scope is not the same')
            }
            possibleHoistedVariable.variable = lvar;
            possibleHoistedVariable.varScope = lvarScope;
          }
        }
      }
      buffer.concat(identifier, node, identifier === 'self' ? 'self' : null);
    },
    YieldExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('yield', node);
      if (node.delegate) buffer.concat('*');
      if (node.argument) {
        buffer.concat(' ');
        c(node.argument, st, 'Expression');
      }
    },
    // Use this when there should not be a look up to issue warnings or add 'self.' before ivars
    VariablePattern: function (node, st, c) {
      const compiler = st.compiler;
      compiler.jsBuffer.concat(node.name, node);
    },
    Literal: function (node, st, c) {
      const compiler = st.compiler;
      if (node.raw) {
        if (node.raw.charAt(0) === '@') { compiler.jsBuffer.concat(node.raw.substring(1), node); } else { compiler.jsBuffer.concat(node.raw, node); }
      } else {
        const value = node.value;
        const doubleQuote = value.indexOf('"') !== -1;
        compiler.jsBuffer.concat(doubleQuote ? "'" : '"', node);
        compiler.jsBuffer.concat(value);
        compiler.jsBuffer.concat(doubleQuote ? "'" : '"');
      }
    },
    ClassDeclaration: function (node, st, c) {
      const buffer = st.compiler.jsBuffer;
      if (node.type === 'ClassExpression') buffer.concat('(');
      buffer.concat('class ');
      if (node.id) {
        st.vars[node.id.name] = { type: 'JSClass', node: node };
        c(node.id, st);
      }
      if (node.superClass) {
        buffer.concat(' extends ');
        c(node.superClass, st);
      }
      st.compiler.indentation += st.compiler.indentStep;
      c(node.body, st, 'ClassBody');
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);
      if (node.type === 'ClassExpression') buffer.concat(')');
    },
    ClassExpression: function (node, st, c) {
      c(node, st, 'ClassDeclaration');
    },
    ClassBody: function (node, st, c) {
      const compiler = st.compiler;
      compiler.jsBuffer.concat(' {\n');
      for (const element of node.body) {
        c(element, st);
        compiler.jsBuffer.concat('\n');
      }
      compiler.jsBuffer.concat('}\n');
    },
    PropertyDefinition: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat(st.compiler.indentation);
      if (node.static) buffer.concat('static ');
      if (node.computed) buffer.concat('[');
      c(node.key, st);
      if (node.computed) buffer.concat(']');
      if (node.value) {
        buffer.concat(' = ');
        c(node.value, st);
      }
      buffer.concat(';');
    },
    MethodDefinition: function (node, st, c) {
      const prefix = [];
      if (node.static) prefix.push('static');
      if (node.kind === 'get') prefix.push('get');
      if (node.kind === 'set') prefix.push('set');

      node.value.id = node.key;
      st.skipFunctionKeyword = true;
      st.methodPrefix = prefix;
      if (node.computed) st.isComputed = true;
      c(node.value, st);
      delete st.methodPrefix;
      st.isComputed = false;
      st.skipFunctionKeyword = false;
    },
    PrivateIdentifier: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('#');
      buffer.concat(node.name);
    },
    MetaProperty: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      // Very specific special cases. Apparently this will be used in future versions of ES.
      if (node.meta.name === 'import') {
        buffer.concat('import.meta');
      } else {
        buffer.concat('new.target');
      }
    },
    Super: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('super');
    },
    ExportNamedDeclaration: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      // The different cases we can have when we encounter an 'ExportNamedDeclaration'
      // Case 1: declaration is non-null, specifiers are null, source is null. Example: export var foo = 1.
      // Case 2: declaration is null, specifiers are non-null, source is null
      // Case 3: declaration is null, specifiers are non-null, source is non-null

      buffer.concat('export ');
      if (node.declaration) {
        c(node.declaration, st);
      } else {
        buffer.concat('{');
        let isFirst = true;
        for (const specifier of node.specifiers) {
          if (!isFirst) {
            buffer.concat(', ');
          } else {
            isFirst = false;
          }
          c(specifier, st);
        }
        buffer.concat('}');
        if (node.source) {
          buffer.concat(' from ');
          c(node.source, st);
        }
      }
      buffer.concat('\n');
    },
    ExportSpecifier: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      c(node.local, st);
      if (node.local !== node.exported) {
        buffer.concat(' as ');
        c(node.exported, st);
      }
    },
    ExportDefaultDeclaration: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      st.isDefaultExport = true;
      buffer.concat('export default ');
      c(node.declaration, st);
      delete st.isDefaultExport;
    },
    ExportAllDeclaration: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      buffer.concat('export * ');
      if (node.exported) {
        buffer.concat('as ');
        c(node.exported, st);
      }
      if (node.source) {
        buffer.concat(' from ');
        c(node.source, st);
      }
      buffer.concat('\n');
    },
    ImportDeclaration: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('import ');
      let startedCurly = false;
      let isFirst = true;
      for (const specifier of node.specifiers) {
        if (!isFirst) buffer.concat(', ');
        else isFirst = false;
        switch (specifier.type) {
          case 'ImportSpecifier':
            if (!startedCurly) buffer.concat('{');
            startedCurly = true;
            c(specifier.imported, st);
            if (specifier.local !== specifier.imported) {
              buffer.concat(' as ');
              c(specifier.local, st);
            }
            break
          case 'ImportDefaultSpecifier':
            c(specifier.local, st);
            break
          case 'ImportNamespaceSpecifier':
            buffer.concat('* as ');
            c(specifier.local, st);
            break
        }
      }
      if (startedCurly) buffer.concat('}');
      if (node.specifiers.length > 0) buffer.concat(' from ');
      c(node.source, st);
      buffer.concat('\n');
    },
    ImportExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('import');
      buffer.concat('(');
      c(node.source, st);
      buffer.concat(')');
    },
    ArrayLiteral: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const elementLength = node.elements.length;
      const varScope = st.getVarScope();

      if (!varScope.receiverLevel) varScope.receiverLevel = 0;
      if (!elementLength) {
        if (compiler.options.inlineMsgSendFunctions) {
          buffer.concat('(___r', node);
          buffer.concat(++varScope.receiverLevel + '');
          buffer.concat(' = (CPArray.isa.method_msgSend["alloc"] || _objj_forward)(CPArray, "alloc"), ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' == null ? ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' : (___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat('.isa.method_msgSend["init"] || _objj_forward)(___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(', "init"))');
        } else {
          buffer.concat('(___r');
          buffer.concat(++varScope.receiverLevel + '');
          buffer.concat(' = CPArray.isa.objj_msgSend0(CPArray, "alloc"), ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' == null ? ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' : ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat('.isa.objj_msgSend0(___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(', "init"))');
        }

        if (!(varScope.maxReceiverLevel >= varScope.receiverLevel)) { varScope.maxReceiverLevel = varScope.receiverLevel; }
      } else {
        if (compiler.options.inlineMsgSendFunctions) {
          buffer.concat('(___r', node);
          buffer.concat(++varScope.receiverLevel + '');
          buffer.concat(' = (CPArray.isa.method_msgSend["alloc"] || _objj_forward)(CPArray, "alloc"), ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' == null ? ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' : (___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat('.isa.method_msgSend["initWithObjects:count:"] || _objj_forward)(___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(', "initWithObjects:count:", [');
        } else {
          buffer.concat('(___r', node);
          buffer.concat(++varScope.receiverLevel + '');
          buffer.concat(' = CPArray.isa.objj_msgSend0(CPArray, "alloc"), ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' == null ? ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' : ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat('.isa.objj_msgSend2(___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(', "initWithObjects:count:", [');
        }

        if (!(varScope.maxReceiverLevel >= varScope.receiverLevel)) { varScope.maxReceiverLevel = varScope.receiverLevel; }
      }
      if (elementLength) {
        for (let i = 0; i < elementLength; i++) {
          const elt = node.elements[i];

          if (i) { buffer.concat(', '); }

          c(elt, st, 'Expression');
        }
        buffer.concat('], ' + elementLength + '))');
      }
      varScope.receiverLevel--;
    },
    DictionaryLiteral: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const keyLength = node.keys.length;
      const varScope = st.getVarScope();

      if (!varScope.receiverLevel) varScope.receiverLevel = 0;
      if (!keyLength) {
        if (compiler.options.inlineMsgSendFunctions) {
          buffer.concat('(___r', node);
          buffer.concat(++varScope.receiverLevel + '');
          buffer.concat(' = (CPDictionary.isa.method_msgSend["alloc"] || _objj_forward)(CPDictionary, "alloc"), ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' == null ? ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' : (___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat('.isa.method_msgSend["init"] || _objj_forward)(___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(', "init"))');
        } else {
          buffer.concat('(___r');
          buffer.concat(++varScope.receiverLevel + '');
          buffer.concat(' = CPDictionary.isa.objj_msgSend0(CPDictionary, "alloc"), ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' == null ? ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' : ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat('.isa.objj_msgSend0(___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(', "init"))');
        }

        if (!(varScope.maxReceiverLevel >= varScope.receiverLevel)) { varScope.maxReceiverLevel = varScope.receiverLevel; }
      } else {
        if (compiler.options.inlineMsgSendFunctions) {
          buffer.concat('(___r', node);
          buffer.concat(++varScope.receiverLevel + '');
          buffer.concat(' = (CPDictionary.isa.method_msgSend["alloc"] || _objj_forward)(CPDictionary, "alloc"), ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' == null ? ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' : (___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat('.isa.method_msgSend["initWithObjects:forKeys:"] || _objj_forward)(___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(', "initWithObjects:forKeys:", [');
        } else {
          buffer.concat('(___r', node);
          buffer.concat(++varScope.receiverLevel + '');
          buffer.concat(' = CPDictionary.isa.objj_msgSend0(CPDictionary, "alloc"), ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' == null ? ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(' : ___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat('.isa.objj_msgSend2(___r');
          buffer.concat(varScope.receiverLevel + '');
          buffer.concat(', "initWithObjects:forKeys:", [');
        }

        if (!(varScope.maxReceiverLevel >= varScope.receiverLevel)) { varScope.maxReceiverLevel = varScope.receiverLevel; }

        for (let i = 0; i < keyLength; i++) {
          const value = node.values[i];

          if (i) buffer.concat(', ');
          c(value, st, 'Expression');
        }

        buffer.concat('], [');

        for (let i = 0; i < keyLength; i++) {
          const key = node.keys[i];

          if (i) buffer.concat(', ');

          c(key, st, 'Expression');
        }
        buffer.concat(']))');
      }
      varScope.receiverLevel--;
    },
    ImportStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const localfilepath = node.localfilepath;
      buffer.concat('objj_executeFile("', node);
      buffer.concat(node.filename.value);
      buffer.concat(localfilepath ? '", YES);' : '", NO);');
    },
    ClassDeclarationStatement: function (node, st, c) {
      const compiler = st.compiler;
      const saveJSBuffer = compiler.jsBuffer;
      const className = node.classname.name;
      let classDef = compiler.getClassDef(className);
      const classScope = new Scope(st);
      const isInterfaceDeclaration = node.type === 'InterfaceDeclarationStatement';
      const protocols = node.protocols;
      const options = compiler.options;

      compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL, options.sourceMap && options.sourceMapIncludeSource ? compiler.source : null);
      compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);
      compiler.classBodyBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL); // TODO: Check if this is needed

      if (compiler.getTypeDef(className)) { throw compiler.error_message(className + ' is already declared as a type', node.classname) }

      // First we declare the class
      if (node.superclassname) {
        // Must have methods dictionaries and ivars dictionary to be a real implementaion declaration.
        // Without it is a "@class" declaration (without both ivars dictionary and method dictionaries) or
        // "interface" declaration (without ivars dictionary)
        // TODO: Create a ClassDef object and add this logic to it

        // It has a real implementation declaration already
        if (classDef && classDef.ivars) {
          throw compiler.error_message('Duplicate class ' + className, node.classname)
        }

        // It has a interface declaration already
        if (isInterfaceDeclaration && classDef && classDef.instanceMethods && classDef.classMethods) {
          throw compiler.error_message('Duplicate interface definition for class ' + className, node.classname)
        }
        const superClassDef = compiler.getClassDef(node.superclassname.name);
        if (!superClassDef) { // Don't throw error for this when generating Objective-J code
          let errorMessage = "Can't find superclass " + node.superclassname.name;
          const stack = compiler.constructor.importStack;
          if (stack) {
            for (let i = compiler.constructor.importStack.length; --i >= 0;) { errorMessage += '\n' + Array((stack.length - i) * 2 + 1).join(' ') + 'Imported by: ' + stack[i]; }
          }
          throw compiler.error_message(errorMessage, node.superclassname)
        }

        classDef = new ClassDef(!isInterfaceDeclaration, className, superClassDef, Object.create(null));

        saveJSBuffer.concat('\n{var the_class = objj_allocateClassPair(' + node.superclassname.name + ', "' + className + '"),\nmeta_class = the_class.isa;', node);
      } else if (node.categoryname) {
        classDef = compiler.getClassDef(className);
        if (!classDef) { throw compiler.error_message('Class ' + className + ' not found ', node.classname) }

        saveJSBuffer.concat('{\nvar the_class = objj_getClass("' + className + '")\n', node);
        saveJSBuffer.concat('if(!the_class) throw new SyntaxError("*** Could not find definition for class \\"' + className + '\\"");\n');
        saveJSBuffer.concat('var meta_class = the_class.isa;');
      } else {
        classDef = new ClassDef(!isInterfaceDeclaration, className, null, Object.create(null));

        saveJSBuffer.concat('{var the_class = objj_allocateClassPair(Nil, "' + className + '"),\nmeta_class = the_class.isa;', node);
      }

      if (protocols) {
        for (let i = 0, size = protocols.length; i < size; i++) {
          saveJSBuffer.concat('\nvar aProtocol = objj_getProtocol("' + protocols[i].name + '");', protocols[i]);
          saveJSBuffer.concat('\nif (!aProtocol) throw new SyntaxError("*** Could not find definition for protocol \\"' + protocols[i].name + '\\"");');
          saveJSBuffer.concat('\nclass_addProtocol(the_class, aProtocol);');
        }
      }
      /*
              if (isInterfaceDeclaration)
                  classDef.interfaceDeclaration = true;
          */
      classScope.classDef = classDef;
      compiler.currentSuperClass = 'objj_getClass("' + className + '").super_class';
      compiler.currentSuperMetaClass = 'objj_getMetaClass("' + className + '").super_class';

      let firstIvarDeclaration = true;
      const ivars = classDef.ivars;
      const classDefIvars = [];
      let hasAccessors = false;

      // Then we add all ivars
      if (node.ivardeclarations) {
        for (let i = 0; i < node.ivardeclarations.length; ++i) {
          const ivarDecl = node.ivardeclarations[i];
          const ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null;
          const ivarTypeIsClass = ivarDecl.ivartype ? ivarDecl.ivartype.typeisclass : false;
          const ivarIdentifier = ivarDecl.id;
          const ivarName = ivarIdentifier.name;
          const ivar = { type: ivarType, name: ivarName };
          const accessors = ivarDecl.accessors;

          const checkIfIvarIsAlreadyDeclaredAndInSuperClass = function (aClassDef, recursiveFunction) {
            if (aClassDef.ivars[ivarName]) { throw compiler.error_message("Instance variable '" + ivarName + "' is already declared for class " + className + (aClassDef.name !== className ? ' in superclass ' + aClassDef.name : ''), ivarDecl.id) }
            if (aClassDef.superClass) { recursiveFunction(aClassDef.superClass, recursiveFunction); }
          };

          // Check if ivar is already declared in this class or its super classes.
          checkIfIvarIsAlreadyDeclaredAndInSuperClass(classDef, checkIfIvarIsAlreadyDeclaredAndInSuperClass);

          const isTypeDefined = !ivarTypeIsClass || typeof global[ivarType] !== 'undefined' || (typeof window !== 'undefined' && typeof window[ivarType] !== 'undefined') ||
            compiler.getClassDef(ivarType) || compiler.getTypeDef(ivarType) || ivarType === classDef.name;

          if (!isTypeDefined && compiler.options.warnings.includes(warningUnknownIvarType)) { compiler.addWarning(createMessage("Unknown type '" + ivarType + "' for ivar '" + ivarName + "'", ivarDecl.ivartype, compiler.source)); }

          if (firstIvarDeclaration) {
            firstIvarDeclaration = false;
            saveJSBuffer.concat('class_addIvars(the_class, [');
          } else { saveJSBuffer.concat(', '); }

          if (options.includeIvarTypeSignatures) { saveJSBuffer.concat('new objj_ivar("' + ivarName + '", "' + ivarType + '")', node); } else { saveJSBuffer.concat('new objj_ivar("' + ivarName + '")', node); }

          if (ivarDecl.outlet) { ivar.outlet = true; }

          // Store the classDef ivars into array and add them later when accessors are created to prevent ivar duplicate error when generating accessors
          classDefIvars.push(ivar);

          if (!classScope.ivars) { classScope.ivars = Object.create(null); }
          classScope.ivars[ivarName] = { type: 'ivar', name: ivarName, node: ivarIdentifier, ivar };

          if (accessors) {
            // Declare the accessor methods in the class definition.
            // TODO: This next couple of lines for getting getterName and setterName are duplicated from below. Create functions for this.
            const property = (accessors.property && accessors.property.name) || ivarName;
            const getterName = (accessors.getter && accessors.getter.name) || property;

            classDef.addInstanceMethod(new MethodDef(getterName, [ivarType]));

            if (!accessors.readonly) {
              let setterName = accessors.setter ? accessors.setter.name : null;

              if (!setterName) {
                const start = property.charAt(0) === '_' ? 1 : 0;

                setterName = (start ? '_' : '') + 'set' + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ':';
              }
              classDef.addInstanceMethod(new MethodDef(setterName, ['void', ivarType]));
            }
            hasAccessors = true;
          }
        }
      }
      if (!firstIvarDeclaration) { saveJSBuffer.concat(']);'); }

      // If we have accessors add get and set methods for them
      if (!isInterfaceDeclaration && hasAccessors) {
        // We pass false to the string buffer as we don't need source map when we create the Objective-J code for the accessors
        const getterSetterBuffer = new StringBuffer(false);

        // Add the class declaration to compile accessors correctly
        // Remove all protocols from class declaration
        getterSetterBuffer.concat(compiler.source.substring(node.start, node.endOfIvars).replace(/<.*>/g, ''));
        getterSetterBuffer.concat('\n');

        for (let i = 0; i < node.ivardeclarations.length; ++i) {
          const ivarDecl = node.ivardeclarations[i];
          const ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null;
          const ivarName = ivarDecl.id.name;
          const accessors = ivarDecl.accessors;

          if (!accessors) { continue }

          const property = (accessors.property && accessors.property.name) || ivarName;
          const getterName = (accessors.getter && accessors.getter.name) || property;
          const getterCode = '- (' + (ivarType || 'id') + ')' + getterName + '\n{\n    return ' + ivarName + ';\n}\n';

          getterSetterBuffer.concat(getterCode);

          if (accessors.readonly) { continue }

          let setterName = accessors.setter ? accessors.setter.name : null;

          if (!setterName) {
            const start = property.charAt(0) === '_' ? 1 : 0;

            setterName = (start ? '_' : '') + 'set' + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ':';
          }

          let setterCode = '- (void)' + setterName + '(' + (ivarType || 'id') + ')newValue\n{\n    ';

          if (accessors.copy) { setterCode += 'if (' + ivarName + ' !== newValue)\n        ' + ivarName + ' = [newValue copy];\n}\n'; } else { setterCode += ivarName + ' = newValue;\n}\n'; }

          getterSetterBuffer.concat(setterCode);
        }

        getterSetterBuffer.concat('\n@end');

        // Remove all @accessors or we will get a recursive loop in infinity
        const b = getterSetterBuffer.toString().replace(/@accessors(\(.*\))?/g, '');
        const compilerOptions = setupOptions(options);

        compilerOptions.sourceMapIncludeSource = true;
        const url = compiler.url;
        const filename = url && compiler.URL.substr(compiler.URL.lastIndexOf('/') + 1);
        const dotIndex = filename && filename.lastIndexOf('.');
        const filenameNoExt = filename && (filename.substr(0, dotIndex === -1 ? filename.length : dotIndex));
        const filenameExt = filename && filename.substr(dotIndex === -1 ? filename.length : dotIndex);
        const categoryname = node.categoryname && node.categoryname.id;
        const imBuffer = exports.compileToIMBuffer(b, filenameNoExt + '_' + className + (categoryname ? '_' + categoryname : '') + '_Accessors' + (filenameExt || ''), compilerOptions);

        // Add the accessors methods first to instance method buffer.
        // This will allow manually added set and get methods to override the compiler generated
        const generatedCode = imBuffer.toString();

        if (compiler.createSourceMap) {
          compiler.imBuffer.concat(sourceMap.SourceNode.fromStringWithSourceMap(generatedCode.code, sourceMap.SourceMapConsumer(generatedCode.map.toString())));
        } else {
          compiler.imBuffer.concat(generatedCode);
        }
      }

      // We will store the ivars into the classDef first after accessors are done so we don't get a duplicate ivars error when generating accessors
      for (let ivarSize = classDefIvars.length, i = 0; i < ivarSize; i++) {
        const ivar = classDefIvars[i];
        const ivarName = ivar.name;

        // Store the ivar into the classDef
        ivars[ivarName] = ivar;
      }

      // We will store the classDef first after accessors are done so we don't get a duplicate class error when generating accessors
      compiler.classDefs[className] = classDef;

      const bodies = node.body;
      const bodyLength = bodies.length;

      if (bodyLength > 0) {
        // And last add methods and other statements
        for (let i = 0; i < bodyLength; ++i) {
          const body = bodies[i];
          c(body, classScope, 'Statement');
        }
      }

      // We must make a new class object for our class definition if it's not a category
      if (!isInterfaceDeclaration && !node.categoryname) {
        saveJSBuffer.concat('objj_registerClassPair(the_class);\n');
      }

      // Add instance methods
      if (compiler.imBuffer.isEmpty()) {
        saveJSBuffer.concat('class_addMethods(the_class, [');
        saveJSBuffer.appendStringBuffer(compiler.imBuffer);
        saveJSBuffer.concat(']);\n');
      }

      // Add class methods
      if (compiler.cmBuffer.isEmpty()) {
        saveJSBuffer.concat('class_addMethods(meta_class, [');
        saveJSBuffer.appendStringBuffer(compiler.cmBuffer);
        saveJSBuffer.concat(']);\n');
      }

      saveJSBuffer.concat('}\n');

      compiler.jsBuffer = saveJSBuffer;

      // Skip the "@end"

      // If the class conforms to protocols check that all required methods are implemented
      if (protocols) {
        // Lookup the protocolDefs for the protocols
        const protocolDefs = [];

        for (let i = 0, size = protocols.length; i < size; i++) {
          const protocol = protocols[i];
          const protocolDef = compiler.getProtocolDef(protocol.name);

          if (!protocolDef) { throw compiler.error_message("Cannot find protocol declaration for '" + protocol.name + "'", protocol) }

          protocolDefs.push(protocolDef);
        }

        const unimplementedMethods = classDef.listOfNotImplementedMethodsForProtocols(protocolDefs);

        if (unimplementedMethods && unimplementedMethods.length > 0) {
          for (let j = 0, unimpSize = unimplementedMethods.length; j < unimpSize; j++) {
            const unimplementedMethod = unimplementedMethods[j];
            const methodDef = unimplementedMethod.methodDef;
            const protocolDef = unimplementedMethod.protocolDef;

            compiler.addWarning(createMessage("Method '" + methodDef.name + "' in protocol '" + protocolDef.name + "' is not implemented", node.classname, compiler.source));
          }
        }
      }
    },
    ProtocolDeclarationStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const protocolName = node.protocolname.name;
      let protocolDef = compiler.getProtocolDef(protocolName);
      const protocols = node.protocols;
      const protocolScope = new Scope(st);
      const inheritFromProtocols = [];

      if (protocolDef) { throw compiler.error_message('Duplicate protocol ' + protocolName, node.protocolname) }

      compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);
      compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);

      buffer.concat('{var the_protocol = objj_allocateProtocol("' + protocolName + '");', node);

      if (protocols) {
        for (let i = 0, size = protocols.length; i < size; i++) {
          const protocol = protocols[i];
          const inheritFromProtocolName = protocol.name;
          const inheritProtocolDef = compiler.getProtocolDef(inheritFromProtocolName);

          if (!inheritProtocolDef) { throw compiler.error_message("Can't find protocol " + inheritFromProtocolName, protocol) }

          buffer.concat('\nvar aProtocol = objj_getProtocol("' + inheritFromProtocolName + '");', node);
          buffer.concat('\nif (!aProtocol) throw new SyntaxError("*** Could not find definition for protocol \\"' + protocolName + '\\"");', node);
          buffer.concat('\nprotocol_addProtocol(the_protocol, aProtocol);', node);

          inheritFromProtocols.push(inheritProtocolDef);
        }
      }

      protocolDef = new ProtocolDef(protocolName, inheritFromProtocols);
      compiler.protocolDefs[protocolName] = protocolDef;
      protocolScope.protocolDef = protocolDef;

      const someRequired = node.required;

      if (someRequired) {
        const requiredLength = someRequired.length;

        if (requiredLength > 0) {
          // We only add the required methods
          for (let i = 0; i < requiredLength; ++i) {
            const required = someRequired[i];
            c(required, protocolScope, 'Statement');
          }
        }
      }

      buffer.concat('\nobjj_registerProtocol(the_protocol);\n');

      // Add instance methods
      if (compiler.imBuffer.isEmpty()) {
        buffer.concat('protocol_addMethodDescriptions(the_protocol, [');
        buffer.appendStringBuffer(compiler.imBuffer);
        buffer.concat('], true, true);\n');
      }

      // Add class methods
      if (compiler.cmBuffer.isEmpty()) {
        buffer.concat('protocol_addMethodDescriptions(the_protocol, [');
        buffer.appendStringBuffer(compiler.cmBuffer);
        buffer.concat('], true, false);\n');
      }

      buffer.concat('}');

      compiler.jsBuffer = buffer;

      // Skip the "@end"
    },
    IvarDeclaration: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      if (node.outlet) { buffer.concat('@outlet '); }
      c(node.ivartype, st, 'VariablePattern');
      buffer.concat(' ');
      c(node.id, st, 'VariablePattern');
      if (node.accessors) { buffer.concat(' @accessors'); }
    },
    MethodDeclarationStatement: function (node, st, c) {
      const compiler = st.compiler;
      const saveJSBuffer = compiler.jsBuffer;
      const methodScope = new FunctionScope(st);
      const isInstanceMethodType = node.methodtype === '-';
      const selectors = node.selectors;
      const nodeArguments = node.arguments;
      const returnType = node.returntype;
      const types = [returnType ? returnType.name : (node.action ? 'void' : 'id')]; // Return type is 'id' as default except if it is an action declared method, then it's 'void'
      const returnTypeProtocols = returnType ? returnType.protocols : null;
      let selector = selectors[0].name; // There is always at least one selector

      if (returnTypeProtocols) {
        for (let i = 0, size = returnTypeProtocols.length; i < size; i++) {
          const returnTypeProtocol = returnTypeProtocols[i];
          if (!compiler.getProtocolDef(returnTypeProtocol.name)) {
            compiler.addWarning(createMessage("Cannot find protocol declaration for '" + returnTypeProtocol.name + "'", returnTypeProtocol, compiler.source));
          }
        }
      }

      // If we are generating objective-J code write everything directly to the regular buffer
      // Otherwise we have one for instance methods and one for class methods.
      compiler.jsBuffer = isInstanceMethodType ? compiler.imBuffer : compiler.cmBuffer;

      // Put together the selector. Maybe this should be done in the parser...
      // Or maybe we should do it here as when genereting Objective-J code it's kind of handy
      if (nodeArguments.length > 0) {
        for (let i = 0; i < nodeArguments.length; i++) {
          const argument = nodeArguments[i];
          const argumentType = argument.type;
          const argumentTypeName = argumentType ? argumentType.name : 'id';
          const argumentProtocols = argumentType ? argumentType.protocols : null;

          types.push(argumentTypeName);

          if (i === 0) { selector += ':'; } else { selector += (selectors[i] ? selectors[i].name : '') + ':'; }

          if (argumentProtocols) {
            for (let j = 0; j < argumentProtocols.length; j++) {
              const argumentProtocol = argumentProtocols[j];
              if (!compiler.getProtocolDef(argumentProtocol.name)) {
                compiler.addWarning(createMessage("Cannot find protocol declaration for '" + argumentProtocol.name + "'", argumentProtocol, compiler.source));
              }
            }
          }
        }
      }

      // Add comma separator if this is not first method in this buffer
      if (compiler.jsBuffer.isEmpty()) {
        compiler.jsBuffer.concat(', ');
      }

      compiler.jsBuffer.concat('new objj_method(sel_getUid("', node);
      compiler.jsBuffer.concat(selector);
      compiler.jsBuffer.concat('"), ');

      if (node.body) {
        if (node.returntype && node.returntype.async) { compiler.jsBuffer.concat('async '); }
        compiler.jsBuffer.concat('function');

        if (compiler.options.includeMethodFunctionNames) {
          compiler.jsBuffer.concat(' $' + st.currentClassName() + '__' + selector.replace(/:/g, '_'));
        }

        compiler.jsBuffer.concat('(self, _cmd');

        methodScope.methodType = node.methodtype;
        methodScope.vars.self = { type: 'method base', scope: methodScope };
        methodScope.vars._cmd = { type: 'method base', scope: methodScope };

        if (nodeArguments) {
          for (let i = 0; i < nodeArguments.length; i++) {
            const argument = nodeArguments[i];
            const argumentName = argument.identifier.name;

            compiler.jsBuffer.concat(', ');
            compiler.jsBuffer.concat(argumentName, argument.identifier);

            methodScope.vars[argumentName] = { type: 'method argument', node: argument };
          }
        }

        compiler.jsBuffer.concat(')\n');

        st.compiler.indentation += st.compiler.indentStep;
        methodScope.endOfScopeBody = true;
        c(node.body, methodScope, 'Statement');
        methodScope.variablesNotReadWarnings();
        st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize);

        compiler.jsBuffer.concat('\n');
      } else { // It is a interface or protocol declatartion and we don't have a method implementation
        compiler.jsBuffer.concat('Nil\n');
      }

      if (compiler.options.includeMethodArgumentTypeSignatures) { compiler.jsBuffer.concat(',' + JSON.stringify(types)); }
      compiler.jsBuffer.concat(')');
      compiler.jsBuffer = saveJSBuffer;

      // Add the method to the class or protocol definition
      let def = st.classDef;
      let alreadyDeclared;

      // But first, if it is a class definition check if it is declared in superclass or interface declaration
      if (def) { alreadyDeclared = isInstanceMethodType ? def.getInstanceMethod(selector) : def.getClassMethod(selector); } else { def = st.protocolDef; }

      if (!def) { throw new Error('InternalError: MethodDeclaration without ClassDeclaration or ProtocolDeclaration at line: ' + objjParser.getLineInfo(compiler.source, node.start).line) }

      // Create warnings if types does not corresponds to method declaration in superclass or interface declarations
      // If we don't find the method in superclass or interface declarations above or if it is a protocol
      // declaration, try to find it in any of the conforming protocols
      if (!alreadyDeclared) {
        const protocols = def.protocols;

        if (protocols) {
          for (let i = 0; i < protocols.length; i++) {
            const protocol = protocols[i];
            alreadyDeclared = isInstanceMethodType ? protocol.getInstanceMethod(selector) : protocol.getClassMethod(selector);

            if (alreadyDeclared) { break }
          }
        }
      }

      if (alreadyDeclared) {
        const declaredTypes = alreadyDeclared.types;

        if (declaredTypes) {
          const typeSize = declaredTypes.length;
          if (typeSize > 0) {
            // First type is return type
            const declaredReturnType = declaredTypes[0];

            // Create warning if return types is not the same. It is ok if superclass has 'id' and subclass has a class type
            if (declaredReturnType !== types[0] && !(declaredReturnType === 'id' && returnType && returnType.typeisclass)) { compiler.addWarning(createMessage("Conflicting return type in implementation of '" + selector + "': '" + declaredReturnType + "' vs '" + types[0] + "'", returnType || node.action || selectors[0], compiler.source)); }

            // Check the parameter types. The size of the two type arrays should be the same as they have the same selector.
            for (let i = 1; i < typeSize; i++) {
              const parameterType = declaredTypes[i];

              if (parameterType !== types[i] && !(parameterType === 'id' && nodeArguments[i - 1].type.typeisclass)) { compiler.addWarning(createMessage("Conflicting parameter types in implementation of '" + selector + "': '" + parameterType + "' vs '" + types[i] + "'", nodeArguments[i - 1].type || nodeArguments[i - 1].identifier, compiler.source)); }
            }
          }
        }
      }

      // Now we add it
      const methodDef = new MethodDef(selector, types);

      if (isInstanceMethodType) { def.addInstanceMethod(methodDef); } else { def.addClassMethod(methodDef); }
    },
    MessageSendExpression: function (node, st, c) {
      const compiler = st.compiler;
      const inlineMsgSend = compiler.options.inlineMsgSendFunctions;
      const buffer = compiler.jsBuffer;
      const nodeObject = node.object;
      const selectors = node.selectors;
      const nodeArguments = node.arguments;
      const argumentsLength = nodeArguments.length;
      const firstSelector = selectors[0];
      let selector = firstSelector ? firstSelector.name : ''; // There is always at least one selector
      const parameters = node.parameters;
      const options = compiler.options;
      const varScope = st.getVarScope();

      // Put together the selector. Maybe this should be done in the parser...
      for (let i = 0; i < argumentsLength; i++) {
        if (i !== 0) {
          const nextSelector = selectors[i];
          if (nextSelector) { selector += nextSelector.name; }
        }
        selector += ':';
      }
      let totalNoOfParameters;
      if (!inlineMsgSend) {
        // Find out the total number of arguments so we can choose appropriate msgSend function. Only needed if call the function and not inline it
        totalNoOfParameters = argumentsLength;

        if (parameters) { totalNoOfParameters += parameters.length; }
      }
      let receiverIsIdentifier;
      let receiverIsNotSelf;
      let selfLvar;
      if (node.superObject) {
        if (inlineMsgSend) {
          buffer.concat('(', node);
          buffer.concat(st.currentMethodType() === '+' ? compiler.currentSuperMetaClass : compiler.currentSuperClass);
          buffer.concat('.method_dtable["', node);
          buffer.concat(selector);
          buffer.concat('"] || _objj_forward)(self', node);
        } else {
          buffer.concat('objj_msgSendSuper', node);
          if (totalNoOfParameters < 4) {
            buffer.concat('' + totalNoOfParameters);
          }
          buffer.concat('({ receiver:self, super_class:' + (st.currentMethodType() === '+' ? compiler.currentSuperMetaClass : compiler.currentSuperClass) + ' }', node);
        }
      } else {
        // If the recevier is not an identifier or an ivar that should have 'self.' infront we need to assign it to a temporary variable
        // If it is 'self' we assume it will never be nil and remove that test
        receiverIsIdentifier = nodeObject.type === 'Identifier' && !(st.currentMethodType() === '-' && compiler.getIvarForClass(nodeObject.name, st) && !st.getLvar(nodeObject.name, true));

        if (receiverIsIdentifier) {
          const name = nodeObject.name;
          selfLvar = st.getLvar(name);

          if (name === 'self') {
            receiverIsNotSelf = !selfLvar || !selfLvar.scope || selfLvar.scope.assignmentToSelf;
          } else {
            receiverIsNotSelf = !!selfLvar || !compiler.getClassDef(name);
          }

          if (receiverIsNotSelf) {
            buffer.concat('(', node);
            c(nodeObject, st, 'Expression');
            buffer.concat(' == null ? ', node);
            c(nodeObject, st, 'Expression');
            buffer.concat(' : ', node);
          }
          if (inlineMsgSend) { buffer.concat('(', node); }
          c(nodeObject, st, 'Expression');
        } else {
          receiverIsNotSelf = true;
          if (!varScope.receiverLevel) varScope.receiverLevel = 0;
          buffer.concat('((___r' + ++varScope.receiverLevel, node);
          buffer.concat(' = ', node);
          c(nodeObject, st, 'Expression');
          buffer.concat(')', node);
          buffer.concat(', ___r' + varScope.receiverLevel, node);
          buffer.concat(' == null ? ', node);
          buffer.concat('___r' + varScope.receiverLevel, node);
          buffer.concat(' : ', node);
          if (inlineMsgSend) { buffer.concat('(', node); }
          buffer.concat('___r' + varScope.receiverLevel, node);
          if (!(varScope.maxReceiverLevel >= varScope.receiverLevel)) { varScope.maxReceiverLevel = varScope.receiverLevel; }
        }
        if (inlineMsgSend) {
          buffer.concat('.isa.method_msgSend["', node);
          buffer.concat(selector, node);
          buffer.concat('"] || _objj_forward)', node);
        } else {
          buffer.concat('.isa.objj_msgSend', node);
        }
      }

      let selectorJSPath;

      if (!node.superObject) {
        if (!inlineMsgSend) {
          if (totalNoOfParameters < 4) {
            buffer.concat('' + totalNoOfParameters, node);
          }
        }

        if (receiverIsIdentifier) {
          buffer.concat('(', node);
          c(nodeObject, st, 'Expression');
        } else {
          buffer.concat('(___r' + varScope.receiverLevel, node);
        }

        // Only do this if source map is enabled and we have an identifier
        if (options.sourceMap && nodeObject.type === 'Identifier') {
          // Get target expression for sourcemap to allow hovering selector to show method function. Create new buffer to write in.
          compiler.jsBuffer = new StringBuffer();
          c(nodeObject, st, 'Expression');
          const aTarget = compiler.jsBuffer.toString();
          selectorJSPath = aTarget + '.isa.method_dtable["' + selector + '"]';
          // Restored buffer so everything will continue as usually.
          compiler.jsBuffer = buffer;
        }
      }

      buffer.concat(', ', node);
      if (selectorJSPath) {
        buffer.concat('(', node);
        for (let i = 0; i < selectors.length; i++) {
          const nextSelector = selectors[i];
          if (nextSelector) {
            buffer.concat(selectorJSPath, nextSelector);
            buffer.concat(', ', node);
          }
        }
      }
      buffer.concat('"', node);

      buffer.concat(selector, node); // FIXME: sel_getUid(selector + "") ? This FIXME is from the old preprocessor compiler
      buffer.concat(selectorJSPath ? '")' : '"', node);

      if (nodeArguments) {
        for (let i = 0; i < nodeArguments.length; i++) {
          const argument = nodeArguments[i];

          buffer.concat(', ', node);
          c(argument, st, 'Expression');
        }
      }

      if (parameters) {
        for (let i = 0; i < parameters.length; ++i) {
          const parameter = parameters[i];

          buffer.concat(', ', node);
          c(parameter, st, 'Expression');
        }
      }

      if (!node.superObject) {
        if (receiverIsNotSelf) { buffer.concat(')', node); }
        if (!receiverIsIdentifier) { varScope.receiverLevel--; }
      }

      buffer.concat(')', node);
    },
    SelectorLiteralExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('sel_getUid("', node);
      buffer.concat(node.selector);
      buffer.concat('")');
    },
    ProtocolLiteralExpression: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('objj_getProtocol("', node);
      c(node.id, st, 'VariablePattern');
      buffer.concat('")');
    },
    Reference: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      buffer.concat('function(__input) { if (arguments.length) return ', node);
      c(node.element, st, 'Expression');
      buffer.concat(' = __input; return ');
      c(node.element, st, 'Expression');
      buffer.concat('; }');
    },
    Dereference: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;

      checkCanDereference(st, node.expr);

      // @deref(y) -> y()
      // @deref(@deref(y)) -> y()()
      c(node.expr, st, 'Expression');
      buffer.concat('()');
    },
    ClassStatement: function (node, st, c) {
      const compiler = st.compiler;
      const className = node.id.name;

      if (compiler.getTypeDef(className)) { throw compiler.error_message(className + ' is already declared as a type', node.id) }

      if (!compiler.getClassDef(className)) {
        compiler.classDefs[className] = new ClassDef(false, className);
      }
      st.vars[node.id.name] = { type: 'class', node: node.id };
    },
    GlobalStatement: function (node, st, c) {
      st.rootScope().vars[node.id.name] = { type: 'global', node: node.id };
    },
    PreprocessStatement: ignore,
    TypeDefStatement: function (node, st, c) {
      const compiler = st.compiler;
      const buffer = compiler.jsBuffer;
      const typeDefName = node.typedefname.name;
      let typeDef = compiler.getTypeDef(typeDefName);
      const typeDefScope = new Scope(st);

      if (typeDef) { throw compiler.error_message('Duplicate type definition ' + typeDefName, node.typedefname) }

      if (compiler.getClassDef(typeDefName)) { throw compiler.error_message(typeDefName + ' is already declared as class', node.typedefname) }

      buffer.concat('{var the_typedef = objj_allocateTypeDef("' + typeDefName + '");', node);

      typeDef = new TypeDef(typeDefName);
      compiler.typeDefs[typeDefName] = typeDef;
      typeDefScope.typeDef = typeDef;

      buffer.concat('\nobjj_registerTypeDef(the_typedef);\n');

      buffer.concat('}');

      // Skip to the end
    }
  });

  // ObjJAcornCompiler was written by Martin Carlberg and released under

  class ObjJAcornCompiler {
    constructor (/* String */ aString, /* CFURL */ aURL, options) {
      this.source = aString;
      this.URL = aURL && aURL.toString();
      options = setupOptions(options);
      this.options = options;
      this.pass = options.pass;
      this.classDefs = options.classDefs;
      this.protocolDefs = options.protocolDefs;
      this.typeDefs = options.typeDefs;
      this.generate = options.generate;
      this.createSourceMap = options.sourceMap;
      this.formatDescription = options.formatDescription;
      this.includeComments = options.includeComments;
      this.transformNamedFunctionDeclarationToAssignment = options.transformNamedFunctionDeclarationToAssignment;
      this.jsBuffer = new StringBuffer(this.createSourceMap, aURL, options.sourceMap && options.sourceMapIncludeSource ? this.source : null);
      this.imBuffer = null;
      this.cmBuffer = null;
      this.dependencies = [];
      this.warningsAndErrors = [];
      this.lastPos = 0;

      this.indentType = ' ';
      this.indentationSpaces = 4;
      this.indentationSize = this.indentationSpaces * this.indentType.length;
      this.indentStep = Array(this.indentationSpaces + 1).join(this.indentType);
      this.indentation = '';

      // this.formatDescription = {
      //    Identifier: {before:"<before>", after:"<after>", parent: {ReturnStatement: {after:"<AFTER>", before:"<BEFORE>"}, Statement: {after:"<After>", before:"<Before>"}}},
      //    BlockStatement: {before:" ", after:"", afterLeftBrace: "\n", beforeRightBrace: "/* Before Brace */"},
      //    Statement: {before:"", after:"/*Statement after*/;\n"}
      // };

      let acornOptions = options.acornOptions;

      if (acornOptions) {
        if (this.URL) { acornOptions.sourceFile = this.URL.substr(this.URL.lastIndexOf('/') + 1); }
        if (options.sourceMap && !acornOptions.locations) { acornOptions.locations = true; }
      } else {
        acornOptions = options.acornOptions = this.URL && { sourceFile: this.URL.substr(this.URL.lastIndexOf('/') + 1) };
        if (options.sourceMap) { acornOptions.locations = true; }
      }

      if (options.macros) {
        if (acornOptions.macros) { acornOptions.macros.concat(options.macros); } else { acornOptions.macros = options.macros; }
      }

      try {
        this.tokens = objjParser__namespace.parse(aString, options.acornOptions);
        this.compile(this.tokens, new Scope(null, { compiler: this }), this.pass === 2 ? pass2 : pass1);
      } catch (e) {
        if (e.lineStart != null) {
          e.messageForLine = aString.substring(e.lineStart, e.lineEnd);
        }
        this.addWarning(e);
        return
      }

      this.setCompiledCode(this.jsBuffer);
    }

    setCompiledCode (stringBuffer) {
      if (this.createSourceMap) {
        const s = stringBuffer.toString();
        this.compiledCode = s.code;
        this.sourceMap = s.map;
      } else {
        this.compiledCode = stringBuffer.toString();
      }
    }

    compilePass2 () {
      const options = this.options;

      exports.currentCompileFile = this.URL;
      this.pass = options.pass = 2;
      this.jsBuffer = new StringBuffer(this.createSourceMap, this.URL, options.sourceMap && options.sourceMapIncludeSource ? this.source : null);

      // To get the source mapping correct when the new Function construtor is used we add a
      // new line as first thing in the code.
      if (this.createSourceMap) { this.jsBuffer.concat('\n\n'); }

      this.warningsAndErrors = [];
      try {
        this.compile(this.tokens, new Scope(null, { compiler: this }), pass2);
      } catch (e) {
        this.addWarning(e);
        return null
      }

      this.setCompiledCode(this.jsBuffer);

      return this.compiledCode
    }

    /*!
          Add warning or error to the list
       */
    addWarning (/* Warning */ aWarning) {
      if (aWarning.path == null) { aWarning.path = this.URL; }

      this.warningsAndErrors.push(aWarning);
    }

    getIvarForClass (/* String */ ivarName, /* Scope */ scope) {
      const ivar = scope.getIvarForCurrentClass(ivarName);

      if (ivar) { return ivar }

      let c = this.getClassDef(scope.currentClassName());

      while (c) {
        const ivars = c.ivars;
        if (ivars) {
          const ivarDef = ivars[ivarName];
          if (ivarDef) { return ivarDef }
        }
        c = c.superClass;
      }
    }

    getClassDef (/* String */ aClassName) {
      if (!aClassName) return null

      let c = this.classDefs[aClassName];

      if (c) return c

      if (typeof objj_getClass === 'function') {
        const aClass = objj_getClass(aClassName);
        if (aClass) {
          const ivars = class_copyIvarList(aClass);
          const ivarSize = ivars.length;
          const myIvars = Object.create(null);
          const protocols = class_copyProtocolList(aClass);
          const protocolSize = protocols.length;
          const myProtocols = Object.create(null);
          const instanceMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(class_copyMethodList(aClass));
          const classMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(class_copyMethodList(aClass.isa));
          const superClass = class_getSuperclass(aClass);

          for (let i = 0; i < ivarSize; i++) {
            const ivar = ivars[i];

            myIvars[ivar.name] = { type: ivar.type, name: ivar.name };
          }

          for (let i = 0; i < protocolSize; i++) {
            const protocol = protocols[i];
            const protocolName = protocol_getName(protocol);
            const protocolDef = this.getProtocolDef(protocolName);

            myProtocols[protocolName] = protocolDef;
          }

          c = new ClassDef(true, aClassName, superClass ? this.getClassDef(superClass.name) : null, myIvars, instanceMethodDefs, classMethodDefs, myProtocols);
          this.classDefs[aClassName] = c;
          return c
        }
      }

      return null
    }

    getProtocolDef (/* String */ aProtocolName) {
      if (!aProtocolName) return null

      let p = this.protocolDefs[aProtocolName];

      if (p) return p

      if (typeof objj_getProtocol === 'function') {
        const aProtocol = objj_getProtocol(aProtocolName);
        if (aProtocol) {
          const protocolName = protocol_getName(aProtocol);
          const requiredInstanceMethods = protocol_copyMethodDescriptionList(aProtocol, true, true);
          const requiredInstanceMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(requiredInstanceMethods);
          const requiredClassMethods = protocol_copyMethodDescriptionList(aProtocol, true, false);
          const requiredClassMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(requiredClassMethods);
          const protocols = aProtocol.protocols;
          const inheritFromProtocols = [];

          if (protocols) {
            for (let i = 0, size = protocols.length; i < size; i++) { inheritFromProtocols.push(this.getProtocolDef(protocols[i].name)); }
          }

          p = new ProtocolDef(protocolName, inheritFromProtocols, requiredInstanceMethodDefs, requiredClassMethodDefs);

          this.protocolDefs[aProtocolName] = p;
          return p
        }
      }

      return null
      //  protocolDef = {"name": protocolName, "protocols": Object.create(null), "required": Object.create(null), "optional": Object.create(null)};
    }

    getTypeDef (/* String */ aTypeDefName) {
      if (!aTypeDefName) { return null }

      let t = this.typeDefs[aTypeDefName];

      if (t) { return t }

      if (typeof objj_getTypeDef === 'function') {
        const aTypeDef = objj_getTypeDef(aTypeDefName);
        if (aTypeDef) {
          const typeDefName = typeDef_getName(aTypeDef);
          t = new TypeDef(typeDefName);
          this.typeDefs[typeDefName] = t;
          return t
        }
      }

      return null
    }

    // FIXME: Does not work anymore
    executable () {
      if (!this._executable) { this._executable = new Executable(this.jsBuffer ? this.jsBuffer.toString() : null, this.dependencies, this.URL, null, this); }
      return this._executable
    }

    IMBuffer () {
      return this.imBuffer
    }

    code () {
      return this.compiledCode
    }

    ast () {
      return JSON.stringify(this.tokens, null, this.indentationSpaces)
    }

    map () {
      return JSON.stringify(this.sourceMap)
    }

    prettifyMessage (/* Message */ aMessage) {
      const line = aMessage.messageForLine;
      let message = '\n' + (line || '');

      // Handle if line does not end with a new line
      if (!message.endsWith('\n')) message += '\n';
      if (line) {
        // Add spaces all the way to the column with the error/warning and mark it with a '^'
        message += (new Array((aMessage.messageOnColumn || 0) + 1)).join(' ');
        message += (new Array(Math.min(1, line.length || 1) + 1)).join('^') + '\n';
      }
      message += (aMessage.messageType || 'ERROR') + ' line ' + (aMessage.messageOnLine || aMessage.line) + ' in ' + this.URL + ':' + aMessage.messageOnLine + ': ' + aMessage.message;

      return message
    }

    error_message (errorMessage, node) {
      const pos = objjParser__namespace.getLineInfo(this.source, node.start);
      const syntaxError = new SyntaxError(errorMessage);

      syntaxError.messageOnLine = pos.line;
      syntaxError.messageOnColumn = pos.column;
      syntaxError.path = this.URL;
      syntaxError.messageForNode = node;
      syntaxError.messageType = 'ERROR';
      syntaxError.messageForLine = this.source.substring(pos.lineStart, pos.lineEnd);

      return syntaxError
    }

    pushImport (url) {
      if (!ObjJAcornCompiler.importStack) ObjJAcornCompiler.importStack = []; // This is used to keep track of imports. Each time the compiler imports a file the url is pushed here.

      ObjJAcornCompiler.importStack.push(url);
    }

    popImport () {
      ObjJAcornCompiler.importStack.pop();
    }

    compile (node, state, visitor) {
      function c (node, st, override) {
        if (typeof visitor[override || node.type] !== 'function') {
          console.log(node.type);
          console.log(override);
          console.log(Object.keys(visitor));
        }
        visitor[override || node.type](node, st, c);
      }
      c(node, state);
    }

    compileWithFormat (node, state, visitor) {
      let lastNode, lastComment;
      function c (node, st, override) {
        const compiler = st.compiler;
        const includeComments = compiler.includeComments;
        const localLastNode = lastNode;
        const sameNode = localLastNode === node;
        // console.log(override || node.type);
        lastNode = node;
        if (includeComments && !sameNode && node.commentsBefore && node.commentsBefore !== lastComment) {
          for (let i = 0; i < node.commentsBefore.length; i++) { compiler.jsBuffer.concat(node.commentsBefore[i]); }
        }
        st.pushNode(node, override);
        const formatDescription = st.formatDescription();
        // console.log("formatDescription: " + JSON.stringify(formatDescription) + ", node.type: " + node.type + ", override: " + override);
        if (!sameNode && formatDescription && formatDescription.before) { compiler.jsBuffer.concatFormat(formatDescription.before); }
        visitor[override || node.type](node, st, c, formatDescription);
        if (!sameNode && formatDescription && formatDescription.after) { compiler.jsBuffer.concatFormat(formatDescription.after); }
        st.popNode();
        if (includeComments && !sameNode && node.commentsAfter) {
          for (let i = 0; i < node.commentsAfter.length; i++) { compiler.jsBuffer.concat(node.commentsAfter[i]); }
          lastComment = node.commentsAfter;
        } else {
          lastComment = null;
        }
      }
      c(node, state);
    }
  }

  ObjJAcornCompiler.methodDefsFromMethodList = function (/* Array */ methodList) {
    const methodSize = methodList.length;
    const myMethods = Object.create(null);

    for (let i = 0; i < methodSize; i++) {
      const method = methodList[i];
      const methodName = method_getName(method);

      myMethods[methodName] = new MethodDef(methodName, method.types);
    }

    return myMethods
  };

  // This might not be used
  function compileToExecutable (/* String */ aString, /* CFURL */ aURL, options) {
    exports.currentCompileFile = aURL;
    return new ObjJAcornCompiler(aString, aURL, options).executable()
  }

  function compileToIMBuffer (/* String */ aString, /* CFURL */ aURL, options) {
    return new ObjJAcornCompiler(aString, aURL, options).IMBuffer()
  }

  function compile (/* String */ aString, /* CFURL */ aURL, options) {
    return new ObjJAcornCompiler(aString, aURL, options)
  }

  function compileFileDependencies (/* String */ aString, /* CFURL */ aURL, options) {
    exports.currentCompileFile = aURL;
    (options || (options = {})).pass = 1;
    return new ObjJAcornCompiler(aString, aURL, options)
  }

  /*!
      This function is used to calculate the number of lines that is added when a 'new Function(...) call is used.
      This is used to make sure source maps are correct
      Currently Safari is adding one line and Chrome and Firefox is adding two lines.

      We calculate this by creating a function and counts the number of new lines at the top of the function
      The result is cached so we only need to make the calculation once.
   */
  function numberOfLinesAtTopOfFunction () {
    const f = new Function('x', 'return x;'); // eslint-disable-line
    const fString = f.toString();
    const index = fString.indexOf('return x;');
    const firstPart = fString.substring(0, index);
    const numberOfLines = (firstPart.match(/\n/g) || []).length;

    ObjJAcornCompiler.numberOfLinesAtTopOfFunction = function () {
      return numberOfLines
    };

    return numberOfLines
  }

  /*!
      Return a parsed option dictionary
   */
  function parseGccCompilerFlags (/* String */ compilerFlags) {
    const args = (compilerFlags || '').split(' ');
    const count = args.length;
    const objjcFlags = {};

    for (let index = 0; index < count; ++index) {
      const argument = args[index];

      if (argument.indexOf('-g') === 0) { objjcFlags.includeMethodFunctionNames = true; } else if (argument.indexOf('-O') === 0) {
        objjcFlags.compress = true; // This is not used in the compiler option dictionary but we add it here as it is also done if compiling from command line.
        // FIXME: currently we are sending in '-O2' when we want InlineMsgSend. Here we only check if it is '-O...'.
        // Maybe we should have some other option for this
        if (argument.length > 2) objjcFlags.inlineMsgSendFunctions = true;
      } else if (argument.indexOf('-T') === 0) {
        // else if (argument.indexOf("-G") === 0)
        // objjcFlags |= ObjJAcornCompiler.Flags.Generate;
        objjcFlags.includeIvarTypeSignatures = false;
        objjcFlags.includeMethodArgumentTypeSignatures = false;
      } else if (argument.indexOf('-S') === 0) {
        objjcFlags.sourceMap = true;
        objjcFlags.sourceMapIncludeSource = true;
      } else if (argument.indexOf('--include') === 0) {
        let includeUrl = args[++index];
        const firstChar = includeUrl && includeUrl.charCodeAt(0);

        // Poor mans unquote
        if (firstChar === 34 || firstChar === 39) { // '"', "'"
          includeUrl = includeUrl.substring(1, includeUrl.length - 1);
        }
        (objjcFlags.includeFiles || (objjcFlags.includeFiles = [])).push(includeUrl);
      } else if (argument.indexOf('--inline-msg-send') === 0) {
        // This option is if you only want to inline message send functions
        objjcFlags.inlineMsgSendFunctions = true;

      /*          else if (argument.indexOf("-I") === 0) {
                      var includeUrl = argument.substring(2),
                          firstChar = includeUrl && includeUrl.charCodeAt(0);

                      (objjcFlags.includeFiles || (objjcFlags.includeFiles = [])).push(includeUrl);
                  }
                  else if (argument.indexOf("'-I") === 0) {
                      var includeUrl = argument.substring(3, argument.length - 1),
                          firstChar = includeUrl && includeUrl.charCodeAt(0);

                      (objjcFlags.includeFiles || (objjcFlags.includeFiles = [])).push(includeUrl);
                  }
                  else if (argument.indexOf('"-I') === 0) {
                      var includeUrl = argument.substring(3, argument.length - 1),
                          firstChar = includeUrl && includeUrl.charCodeAt(0);

                      (objjcFlags.includeFiles || (objjcFlags.includeFiles = [])).push(includeUrl);
                  } */
      } else if (argument.indexOf('-D') === 0) {
        const macroDefinition = argument.substring(2);

        (objjcFlags.macros || (objjcFlags.macros = [])).push(macroDefinition);
      } else if (argument.indexOf('-W') === 0) {
        // TODO: Check if the warning name is a valid one. Now we just grab what is written and set/remove it.
        const isNo = argument.indexOf('no-', 2) === 2;
        const warningName = argument.substring(isNo ? 5 : 2);
        const indexOfWarning = (objjcFlags.warnings || (objjcFlags.warnings = defaultOptions.warnings.slice())).findIndex(function (element) { return element.name === warningName });

        if (isNo) {
          if (indexOfWarning !== -1) {
            // remove if it exists
            objjcFlags.warnings.splice(indexOfWarning, 1);
          }
        } else {
          if (indexOfWarning === -1) {
            // Add if it does not exists
            const theWarning = AllWarnings.find(function (element) { return element.name === warningName });
            if (theWarning) objjcFlags.warnings.push(theWarning);
          }
        }
      }
    }

    return objjcFlags
  }

  exports.compile = compile;
  exports.compileFileDependencies = compileFileDependencies;
  exports.compileToExecutable = compileToExecutable;
  exports.compileToIMBuffer = compileToIMBuffer;
  exports.numberOfLinesAtTopOfFunction = numberOfLinesAtTopOfFunction;
  exports.parseGccCompilerFlags = parseGccCompilerFlags;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=objj-transpiler.cjs.map
