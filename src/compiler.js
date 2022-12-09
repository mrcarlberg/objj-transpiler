// ObjJAcornCompiler was written by Martin Carlberg and released under
// an MIT license.
//
// Git repositories for ObjJAcornCompiler are available at
//
//     https://github.com/mrcarlberg/ObjJAcornCompiler.git
//
// Please use the [github bug tracker][ghbt] to report issues.
//
// [ghbt]: https://github.com/mrcarlberg/ObjJAcornCompiler/issues
//
// This file defines the main compiler interface.
//
// Copyright 2013, 2014, 2015, 2016, Martin Carlberg.

// "use strict"

import * as objjParser from 'objj-parser'

import { Scope } from './scope.js'
import { StringBuffer } from './buffer.js'
import { defaultOptions, setupOptions } from './options.js'
import { pass2, pass1 } from './walk.js'
import { TypeDef, MethodDef } from './definition.js'
import { ClassDef } from './class-def.js'
import { ProtocolDef } from './protocol.js'
import { AllWarnings, getLineOffsets } from './warning.js'

export const version = '0.3.7'

export class ObjJAcornCompiler {
  constructor (/* String */ aString, /* CFURL */ aURL, options) {
    this.source = aString
    this.URL = aURL && aURL.toString()
    options = setupOptions(options)
    this.options = options
    this.pass = options.pass
    this.classDefs = options.classDefs
    this.protocolDefs = options.protocolDefs
    this.typeDefs = options.typeDefs
    this.generate = options.generate
    this.createSourceMap = options.sourceMap
    this.formatDescription = options.formatDescription
    this.includeComments = options.includeComments
    this.transformNamedFunctionDeclarationToAssignment = options.transformNamedFunctionDeclarationToAssignment
    this.jsBuffer = new StringBuffer(this.createSourceMap, aURL, options.sourceMap && options.sourceMapIncludeSource ? this.source : null)
    this.imBuffer = null
    this.cmBuffer = null
    this.dependencies = []
    this.warningsAndErrors = []
    this.lastPos = 0

    this.indentType = ' '
    this.indentationSpaces = 4
    this.indentationSize = this.indentationSpaces * this.indentType.length
    this.indentStep = Array(this.indentationSpaces + 1).join(this.indentType)
    this.indentation = ''

    // this.formatDescription = {
    //    Identifier: {before:"<before>", after:"<after>", parent: {ReturnStatement: {after:"<AFTER>", before:"<BEFORE>"}, Statement: {after:"<After>", before:"<Before>"}}},
    //    BlockStatement: {before:" ", after:"", afterLeftBrace: "\n", beforeRightBrace: "/* Before Brace */"},
    //    Statement: {before:"", after:"/*Statement after*/;\n"}
    // };

    let acornOptions = options.acornOptions

    if (acornOptions) {
      if (this.URL) { acornOptions.sourceFile = this.URL.substr(this.URL.lastIndexOf('/') + 1) }
      if (options.sourceMap && !acornOptions.locations) { acornOptions.locations = true }
    } else {
      acornOptions = options.acornOptions = this.URL && { sourceFile: this.URL.substr(this.URL.lastIndexOf('/') + 1) }
      if (options.sourceMap) { acornOptions.locations = true }
    }

    if (options.macros) {
      if (acornOptions.macros) { acornOptions.macros.concat(options.macros) } else { acornOptions.macros = options.macros }
    }

    try {
      this.tokens = objjParser.parse(aString, options.acornOptions)
      this.compile(this.tokens, new Scope(null, { compiler: this }), this.pass === 2 ? pass2 : pass1)
    } catch (e) {
      const { lineStart, lineEnd } = getLineOffsets(this.source, e.pos)
      e.messageForLine = aString.substring(lineStart, lineEnd)
      this.addWarning(e)
      return
    }

    this.setCompiledCode(this.jsBuffer)
  }

  setCompiledCode (stringBuffer) {
    if (this.createSourceMap) {
      const s = stringBuffer.toString()
      this.compiledCode = s.code
      this.sourceMap = s.map
    } else {
      this.compiledCode = stringBuffer.toString()
    }
  }

  compilePass2 () {
    const options = this.options

    exports.currentCompileFile = this.URL
    this.pass = options.pass = 2
    this.jsBuffer = new StringBuffer(this.createSourceMap, this.URL, options.sourceMap && options.sourceMapIncludeSource ? this.source : null)

    // To get the source mapping correct when the new Function construtor is used we add a
    // new line as first thing in the code.
    if (this.createSourceMap) { this.jsBuffer.concat('\n\n') }

    this.warningsAndErrors = []
    try {
      this.compile(this.tokens, new Scope(null, { compiler: this }), pass2)
    } catch (e) {
      this.addWarning(e)
      return null
    }

    this.setCompiledCode(this.jsBuffer)

    return this.compiledCode
  }

  /*!
        Add warning or error to the list
     */
  addWarning (/* Warning */ aWarning) {
    if (aWarning.path == null) { aWarning.path = this.URL }

    this.warningsAndErrors.push(aWarning)
  }

  getIvarForClass (/* String */ ivarName, /* Scope */ scope) {
    const ivar = scope.getIvarForCurrentClass(ivarName)

    if (ivar) { return ivar }

    let c = this.getClassDef(scope.currentClassName())

    while (c) {
      const ivars = c.ivars
      if (ivars) {
        const ivarDef = ivars[ivarName]
        if (ivarDef) { return ivarDef }
      }
      c = c.superClass
    }
  }

  getClassDef (/* String */ aClassName) {
    if (!aClassName) return null

    let c = this.classDefs[aClassName]

    if (c) return c

    if (typeof objj_getClass === 'function') {
      const aClass = objj_getClass(aClassName)
      if (aClass) {
        const ivars = class_copyIvarList(aClass)
        const ivarSize = ivars.length
        const myIvars = Object.create(null)
        const protocols = class_copyProtocolList(aClass)
        const protocolSize = protocols.length
        const myProtocols = Object.create(null)
        const instanceMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(class_copyMethodList(aClass))
        const classMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(class_copyMethodList(aClass.isa))
        const superClass = class_getSuperclass(aClass)

        for (let i = 0; i < ivarSize; i++) {
          const ivar = ivars[i]

          myIvars[ivar.name] = { type: ivar.type, name: ivar.name }
        }

        for (let i = 0; i < protocolSize; i++) {
          const protocol = protocols[i]
          const protocolName = protocol_getName(protocol)
          const protocolDef = this.getProtocolDef(protocolName)

          myProtocols[protocolName] = protocolDef
        }

        c = new ClassDef(true, aClassName, superClass ? this.getClassDef(superClass.name) : null, myIvars, instanceMethodDefs, classMethodDefs, myProtocols)
        this.classDefs[aClassName] = c
        return c
      }
    }

    return null
  }

  getProtocolDef (/* String */ aProtocolName) {
    if (!aProtocolName) return null

    let p = this.protocolDefs[aProtocolName]

    if (p) return p

    if (typeof objj_getProtocol === 'function') {
      const aProtocol = objj_getProtocol(aProtocolName)
      if (aProtocol) {
        const protocolName = protocol_getName(aProtocol)
        const requiredInstanceMethods = protocol_copyMethodDescriptionList(aProtocol, true, true)
        const requiredInstanceMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(requiredInstanceMethods)
        const requiredClassMethods = protocol_copyMethodDescriptionList(aProtocol, true, false)
        const requiredClassMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(requiredClassMethods)
        const protocols = aProtocol.protocols
        const inheritFromProtocols = []

        if (protocols) {
          for (let i = 0, size = protocols.length; i < size; i++) { inheritFromProtocols.push(this.getProtocolDef(protocols[i].name)) }
        }

        p = new ProtocolDef(protocolName, inheritFromProtocols, requiredInstanceMethodDefs, requiredClassMethodDefs)

        this.protocolDefs[aProtocolName] = p
        return p
      }
    }

    return null
    //  protocolDef = {"name": protocolName, "protocols": Object.create(null), "required": Object.create(null), "optional": Object.create(null)};
  }

  getTypeDef (/* String */ aTypeDefName) {
    if (!aTypeDefName) { return null }

    let t = this.typeDefs[aTypeDefName]

    if (t) { return t }

    if (typeof objj_getTypeDef === 'function') {
      const aTypeDef = objj_getTypeDef(aTypeDefName)
      if (aTypeDef) {
        const typeDefName = typeDef_getName(aTypeDef)
        t = new TypeDef(typeDefName)
        this.typeDefs[typeDefName] = t
        return t
      }
    }

    return null
  }

  // FIXME: Does not work anymore
  executable () {
    if (!this._executable) { this._executable = new Executable(this.jsBuffer ? this.jsBuffer.toString() : null, this.dependencies, this.URL, null, this) }
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
    const line = aMessage.messageForLine
    let message = '\n' + (line || '')

    // Handle if line does not end with a new line
    if (!message.endsWith('\n')) message += '\n'
    if (line) {
      // Add spaces all the way to the column with the error/warning and mark it with a '^'
      message += (new Array((aMessage.loc.column || 0) + 1)).join(' ')
      message += (new Array(Math.min(1, line.length || 1) + 1)).join('^') + '\n'
    }
    message += (aMessage.messageType || 'ERROR') + ' line ' + (aMessage.loc?.line || aMessage.line) + ' in ' + this.URL + (aMessage.loc ? ':' + aMessage.loc.line : "") + ': ' + aMessage.message

    return message
  }

  error_message (errorMessage, node) {
    const loc = objjParser.getLineInfo(this.source, node.start)
    const { lineStart, lineEnd } = getLineOffsets(this.source, node.start)
    const syntaxError = new SyntaxError(errorMessage)

    syntaxError.loc = loc
    syntaxError.path = this.URL
    syntaxError.messageForNode = node
    syntaxError.messageType = 'ERROR'
    syntaxError.messageForLine = this.source.substring(lineStart, lineEnd)

    return syntaxError
  }

  pushImport (url) {
    if (!ObjJAcornCompiler.importStack) ObjJAcornCompiler.importStack = [] // This is used to keep track of imports. Each time the compiler imports a file the url is pushed here.

    ObjJAcornCompiler.importStack.push(url)
  }

  popImport () {
    ObjJAcornCompiler.importStack.pop()
  }

  compile (node, state, visitor) {
    function c (node, st, override) {
      if (typeof visitor[override || node.type] !== 'function') {
        console.log(node.type)
        console.log(override)
        console.log(Object.keys(visitor))
      }
      visitor[override || node.type](node, st, c)
    }
    c(node, state)
  }

  compileWithFormat (node, state, visitor) {
    let lastNode, lastComment
    function c (node, st, override) {
      const compiler = st.compiler
      const includeComments = compiler.includeComments
      const localLastNode = lastNode
      const sameNode = localLastNode === node
      // console.log(override || node.type);
      lastNode = node
      if (includeComments && !sameNode && node.commentsBefore && node.commentsBefore !== lastComment) {
        for (let i = 0; i < node.commentsBefore.length; i++) { compiler.jsBuffer.concat(node.commentsBefore[i]) }
      }
      st.pushNode(node, override)
      const formatDescription = st.formatDescription()
      // console.log("formatDescription: " + JSON.stringify(formatDescription) + ", node.type: " + node.type + ", override: " + override);
      if (!sameNode && formatDescription && formatDescription.before) { compiler.jsBuffer.concatFormat(formatDescription.before) }
      visitor[override || node.type](node, st, c, formatDescription)
      if (!sameNode && formatDescription && formatDescription.after) { compiler.jsBuffer.concatFormat(formatDescription.after) }
      st.popNode()
      if (includeComments && !sameNode && node.commentsAfter) {
        for (let i = 0; i < node.commentsAfter.length; i++) { compiler.jsBuffer.concat(node.commentsAfter[i]) }
        lastComment = node.commentsAfter
      } else {
        lastComment = null
      }
    }
    c(node, state)
  }
}

ObjJAcornCompiler.methodDefsFromMethodList = function (/* Array */ methodList) {
  const methodSize = methodList.length
  const myMethods = Object.create(null)

  for (let i = 0; i < methodSize; i++) {
    const method = methodList[i]
    const methodName = method_getName(method)

    myMethods[methodName] = new MethodDef(methodName, method.types)
  }

  return myMethods
}

/*!
    Return a parsed option dictionary
 */
export function parseGccCompilerFlags (/* String */ compilerFlags) {
  const args = (compilerFlags || '').split(' ')
  const count = args.length
  const objjcFlags = {}

  for (let index = 0; index < count; ++index) {
    const argument = args[index]

    if (argument.indexOf('-g') === 0) { objjcFlags.includeMethodFunctionNames = true } else if (argument.indexOf('-O') === 0) {
      objjcFlags.compress = true // This is not used in the compiler option dictionary but we add it here as it is also done if compiling from command line.
      // FIXME: currently we are sending in '-O2' when we want InlineMsgSend. Here we only check if it is '-O...'.
      // Maybe we should have some other option for this
      if (argument.length > 2) { objjcFlags.inlineMsgSendFunctions = true }
    } else if (argument.indexOf('-T') === 0) {
      // else if (argument.indexOf("-G") === 0)
      // objjcFlags |= ObjJAcornCompiler.Flags.Generate;
      objjcFlags.includeIvarTypeSignatures = false
      objjcFlags.includeMethodArgumentTypeSignatures = false
    } else if (argument.indexOf('-S') === 0) {
      objjcFlags.sourceMap = true
      objjcFlags.sourceMapIncludeSource = true
    } else if (argument.indexOf('--include') === 0) {
      let includeUrl = args[++index]
      const firstChar = includeUrl && includeUrl.charCodeAt(0)

      // Poor mans unquote
      if (firstChar === 34 || firstChar === 39) { // '"', "'"
        includeUrl = includeUrl.substring(1, includeUrl.length - 1)
      }

      (objjcFlags.includeFiles || (objjcFlags.includeFiles = [])).push(includeUrl)
    } else if (argument.indexOf('--inline-msg-send') === 0) {
      // This option is if you only want to inline message send functions
      objjcFlags.inlineMsgSendFunctions = true
    /*        else if (argument.indexOf("-I") === 0) {
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

      (objjcFlags.macros || (objjcFlags.macros = [])).push(macroDefinition)
    } else if (argument.indexOf('-W') === 0) {
      // TODO: Check if the warning name is a valid one. Now we just grab what is written and set/remove it.
      const isNo = argument.indexOf('no-', 2) === 2
      const warningName = argument.substring(isNo ? 5 : 2)
      const indexOfWarning = (objjcFlags.warnings || (objjcFlags.warnings = defaultOptions.warnings.slice())).findIndex(function (element) { return element.name === warningName })

      if (isNo) {
        if (indexOfWarning !== -1) {
          // remove if it exists
          objjcFlags.warnings.splice(indexOfWarning, 1)
        }
      } else {
        if (indexOfWarning === -1) {
          // Add if it does not exists
          const theWarning = AllWarnings.find(function (element) { return element.name === warningName })
          if (theWarning) objjcFlags.warnings.push(theWarning)
        }
      }
    }
  }

  return objjcFlags
}
