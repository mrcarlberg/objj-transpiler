import walk from "acorn-walk"
import {getLineInfo} from "objj-parser"
import {SourceNode, SourceMapConsumer} from "source-map"

import {Scope, FunctionScope, BlockScope} from "./scope"
import {TypeDef, MethodDef} from "./definition"
import {ClassDef} from "./class-def"
import {ProtocolDef} from "./protocol"
import {StringBuffer} from "./buffer"
import {GlobalVariableMaybeWarning, createMessage, warningUnknownClassOrGlobal, warningCreateGlobalInsideFunctionOrMethod, warningShadowIvar, warningUnknownIvarType} from "./warning"
import {wordsRegexp} from "./util"
import {setupOptions} from "./options"

export let pass1, pass2

function isIdempotentExpression(node) {
  switch (node.type) {
  case "Literal":
  case "Identifier":
    return true

  case "ArrayExpression":
    for (let i = 0; i < node.elements.length; ++i) {
      if (!isIdempotentExpression(node.elements[i]))
        return false
    }

    return true

  case "DictionaryLiteral":
    for (let i = 0; i < node.keys.length; ++i) {
      if (!isIdempotentExpression(node.keys[i]))
        return false
      if (!isIdempotentExpression(node.values[i]))
        return false
    }

    return true

  case "ObjectExpression":
    for (let i = 0; i < node.properties.length; ++i)
      if (!isIdempotentExpression(node.properties[i].value))
        return false

    return true

  case "FunctionExpression":
    for (let i = 0; i < node.params.length; ++i)
      if (!isIdempotentExpression(node.params[i]))
        return false

    return true

  case "SequenceExpression":
    for (let i = 0; i < node.expressions.length; ++i)
      if (!isIdempotentExpression(node.expressions[i]))
        return false

    return true

  case "UnaryExpression":
    return isIdempotentExpression(node.argument)

  case "BinaryExpression":
    return isIdempotentExpression(node.left) && isIdempotentExpression(node.right)

  case "ConditionalExpression":
    return isIdempotentExpression(node.test) && isIdempotentExpression(node.consequent) && isIdempotentExpression(node.alternate)

  case "MemberExpression":
    return isIdempotentExpression(node.object) && (!node.computed || isIdempotentExpression(node.property))

  case "Dereference":
    return isIdempotentExpression(node.expr)

  case "Reference":
    return isIdempotentExpression(node.element)

  default:
    return false
  }
}

// We do not allow dereferencing of expressions with side effects because we might need to evaluate the expression twice in certain uses of deref, which is not obvious when you look at the deref operator in plain code.
function checkCanDereference(st, node) {
  if (!isIdempotentExpression(node))
    throw st.compiler.error_message("Dereference of expression with side effects", node)
}

// Surround expression with parentheses
function surroundExpression(c) {
  return function(node, st, override) {
    st.compiler.jsBuffer.concat("(")
    c(node, st, override)
    st.compiler.jsBuffer.concat(")")
  }
}

let operatorPrecedence = {
  // MemberExpression
  // These two are never used as they are a MemberExpression with the attribute 'computed' which tells what operator it uses.
  // ".": 0, "[]": 0,
  // NewExpression
  // This is never used.
  // "new": 1,
  // All these are UnaryExpression or UpdateExpression and never used.
  // "!": 2, "~": 2, "-": 2, "+": 2, "++": 2, "--": 2, "typeof": 2, "void": 2, "delete": 2,
  // BinaryExpression
  "*": 3,
  "/": 3,
  "%": 3,
  "+": 4,
  "-": 4,
  "<<": 5,
  ">>": 5,
  ">>>": 5,
  "<": 6,
  "<=": 6,
  ">": 6,
  ">=": 6,
  in: 6,
  instanceof: 6,
  "==": 7,
  "!=": 7,
  "===": 7,
  "!==": 7,
  "&": 8,
  "^": 9,
  "|": 10,
  // LogicalExpression
  "&&": 11,
  "||": 12,
  "??": 13
  // ConditionalExpression
  // AssignmentExpression
}

let expressionTypePrecedence = {
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
}

function ignore(_node, _st, _c) { }

pass1 = walk.make({
  ImportStatement: function(node, st, c) {
    let urlString = node.filename.value

    st.compiler.dependencies.push({url: urlString, isLocal: node.localfilepath})
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
})

// Returns true if subNode has higher precedence the the root node.
// If the subNode is the right (as in left/right) subNode
function nodePrecedence(node, subNode, right) {
  let nodeType = node.type,
      nodePrecedence = expressionTypePrecedence[nodeType] || -1,
      subNodePrecedence = expressionTypePrecedence[subNode.type] || -1,
      nodeOperatorPrecedence,
      subNodeOperatorPrecedence
  return nodePrecedence < subNodePrecedence || (nodePrecedence === subNodePrecedence && isLogicalBinary.test(nodeType) && ((nodeOperatorPrecedence = operatorPrecedence[node.operator]) < (subNodeOperatorPrecedence = operatorPrecedence[subNode.operator]) || (right && nodeOperatorPrecedence === subNodeOperatorPrecedence)))
}

// Used for arrow functions. Checks if the parameter list needs parentheses.
function mustHaveParentheses(paramList) {
  for (const param of paramList) {
    if (param.type !== "Identifier") {
      return true
    }
  }
  return paramList.length > 1 || paramList.length === 0
}

let reservedIdentifiers = wordsRegexp("self _cmd __filename undefined localStorage arguments")
let wordPrefixOperators = wordsRegexp("delete in instanceof new typeof void")
let isLogicalBinary = wordsRegexp("LogicalExpression BinaryExpression")

pass2 = walk.make({
  Program: function(node, st, c) {
    for (let i = 0; i < node.body.length; ++i) {
      c(node.body[i], st, "Statement")
    }

    // Check maybe warnings
    let maybeWarnings = st.maybeWarnings()
    if (maybeWarnings) for (let i = 0; i < maybeWarnings.length; i++) {
      let maybeWarning = maybeWarnings[i]
      if (maybeWarning.checkIfWarning(st)) {
        st.compiler.addWarning(maybeWarning.message)
      }
    }
  },
  BlockStatement: function(node, st, c) {
    const compiler = st.compiler
    const buffer = compiler.jsBuffer

    let isDecl = st.isDecl
    if (isDecl != null) {
      delete st.isDecl
    }

    let endOfScopeBody = st.endOfScopeBody
    if (endOfScopeBody) {
      delete st.endOfScopeBody
    }

    let skipIndentation = st.skipIndentation
    if (skipIndentation) {
      delete st.skipIndentation
    } else {
      buffer.concat(compiler.indentation.substring(compiler.indentationSize))
    }

    buffer.concat("{\n", node)
    let inner = endOfScopeBody ? st : new BlockScope(st)
    for (let i = 0; i < node.body.length; ++i) {
      if (node.body[i].type === "BlockStatement") {
        compiler.indentation += compiler.indentStep
        c(node.body[i], inner, "Statement")
        compiler.indentation = compiler.indentation.substring(compiler.indentationSize)
      } else {
        c(node.body[i], inner, "Statement")
      }
    }
    !endOfScopeBody && inner.variablesNotReadWarnings()
    let maxReceiverLevel = st.maxReceiverLevel
    if (endOfScopeBody && maxReceiverLevel) {
      buffer.concat(compiler.indentation)
      buffer.concat("var ")
      for (let i = 0; i < maxReceiverLevel; i++) {
        if (i) buffer.concat(", ")
        buffer.concat("___r")
        buffer.concat((i + 1) + "")
      }
      buffer.concat(";\n")
    }

    // Simulate a node for the last curly bracket
    // var endNode = node.loc && { loc: { start: { line : node.loc.end.line, column: node.loc.end.column}}, source: node.loc.source};
    buffer.concat(compiler.indentation.substring(compiler.indentationSize))
    buffer.concat("}", node)
    if (st.isDefaultExport) buffer.concat(";")
    if (!skipIndentation && isDecl !== false) {
      buffer.concat("\n")
    }
    st.indentBlockLevel--
  },
  ExpressionStatement: function(node, st, c) {
    const compiler = st.compiler
    const buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    if (node.expression.type === "Reference") throw compiler.error_message("Can't have reference of expression as a statement", node.expression)
    if ((node.expression.type === "AssignmentExpression" && node.expression.left.type === "ObjectPattern") || node.expression.type === "FunctionExpression" || node.expression.type === "ObjectExpression" || (node.expression.type === "BinaryExpression" && node.expression.left.type === "FunctionExpression") || (node.expression.type === "Literal" && node.expression.value === "use strict" && !node.directive)) {
      surroundExpression(c)(node.expression, st, "Expression")
    } else {
      c(node.expression, st, "Expression")
    }
    buffer.concat(";\n", node)
  },
  IfStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    // Keep the 'else' and 'if' on the same line if it is an 'else if'
    if (!st.superNodeIsElse)
      buffer.concat(st.compiler.indentation)
    else
      delete st.superNodeIsElse
    buffer.concat("if (", node)
    c(node.test, st, "Expression")
    // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
    buffer.concat(")")
    if (node.consequent.type !== "EmptyStatement") buffer.concat("\n")
    st.compiler.indentation += st.compiler.indentStep
    c(node.consequent, st, "Statement")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    let alternate = node.alternate
    if (alternate) {
      let alternateNotIf = alternate.type !== "IfStatement"
      let emptyStatement = alternate.type === "EmptyStatement"
      buffer.concat(st.compiler.indentation)
      // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
      buffer.concat(alternateNotIf ? emptyStatement ? "else" : "else\n" : "else ", node)
      if (alternateNotIf)
        st.compiler.indentation += st.compiler.indentStep
      else
        st.superNodeIsElse = true

      c(alternate, st, "Statement")
      if (alternateNotIf) st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    }
  },
  LabeledStatement: function(node, st, c) {
    let compiler = st.compiler
    let buffer = compiler.jsBuffer
    c(node.label, st, "VariablePattern")
    buffer.concat(": ", node)
    c(node.body, st, "Statement")
  },
  BreakStatement: function(node, st, c) {
    let compiler = st.compiler
    let label = node.label,
        buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    if (label) {
      buffer.concat("break ", node)
      c(label, st, "VariablePattern")
      buffer.concat(";\n")
    } else
      buffer.concat("break;\n", node)
  },
  ContinueStatement: function(node, st, c) {
    let compiler = st.compiler
    let label = node.label,
        buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    if (label) {
      buffer.concat("continue ", node)
      c(label, st, "VariablePattern")
      buffer.concat(";\n")
    } else
      buffer.concat("continue;\n", node)
  },
  WithStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("with(", node)
    c(node.object, st, "Expression")
    buffer.concat(")\n", node)
    st.compiler.indentation += st.compiler.indentStep
    c(node.body, st, "Statement")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
  },
  SwitchStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("switch(", node)
    c(node.discriminant, st, "Expression")
    buffer.concat(") {\n")
    st.compiler.indentation += st.compiler.indentStep
    for (let i = 0; i < node.cases.length; ++i) {
      let cs = node.cases[i]
      if (cs.test) {
        buffer.concat(st.compiler.indentation)
        buffer.concat("case ")
        c(cs.test, st, "Expression")
        buffer.concat(":\n")
      } else
        buffer.concat("default:\n")
      st.compiler.indentation += st.compiler.indentStep
      for (let j = 0; j < cs.consequent.length; ++j)
        c(cs.consequent[j], st, "Statement")
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    }
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    buffer.concat(st.compiler.indentation)
    buffer.concat("}\n")
  },
  ReturnStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("return", node)
    if (node.argument) {
      buffer.concat(" ")
      c(node.argument, st, "Expression")
    }
    buffer.concat(";\n")
  },
  ThrowStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("throw", node)
    buffer.concat(" ")
    c(node.argument, st, "Expression")
    buffer.concat(";\n")
  },
  TryStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("try", node)
    buffer.concat(" ")
    st.compiler.indentation += st.compiler.indentStep
    st.skipIndentation = true
    c(node.block, st, "Statement")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    if (node.handler) {
      let handler = node.handler,
          inner = new Scope(st),
          param = handler.param,
          name = param?.name
      if (name) inner.vars[name] = {type: "catch clause", node: param}
      buffer.concat("\n")
      buffer.concat(st.compiler.indentation)
      buffer.concat("catch")
      if (param) {
        buffer.concat("(")
        c(param, st, "Pattern")
        buffer.concat(") ")
      }
      st.compiler.indentation += st.compiler.indentStep
      inner.skipIndentation = true
      inner.endOfScopeBody = true
      c(handler.body, inner, "BlockStatement")
      inner.variablesNotReadWarnings()
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
      inner.copyAddedSelfToIvarsToParent()
    }
    if (node.finalizer) {
      buffer.concat("\n")
      buffer.concat(st.compiler.indentation)
      buffer.concat("finally ")
      st.compiler.indentation += st.compiler.indentStep
      st.skipIndentation = true
      c(node.finalizer, st, "Statement")
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    }
    buffer.concat("\n")
  },
  WhileStatement: function(node, st, c) {
    let compiler = st.compiler,
        body = node.body,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("while (", node)
    c(node.test, st, "Expression")
    // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
    buffer.concat(")")
    if (node.body.type !== "EmptyStatement") buffer.concat("\n")
    st.compiler.indentation += st.compiler.indentStep
    c(body, st, "Statement")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
  },
  DoWhileStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("do\n", node)
    st.compiler.indentation += st.compiler.indentStep
    c(node.body, st, "Statement")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    buffer.concat(st.compiler.indentation)
    buffer.concat("while (")
    c(node.test, st, "Expression")
    buffer.concat(");\n")
  },
  ForStatement: function(node, st, c) {
    let compiler = st.compiler,
        body = node.body,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("for (", node)
    if (node.init) c(node.init, st, "ForInit")
    buffer.concat("; ")
    if (node.test) c(node.test, st, "Expression")
    buffer.concat("; ")
    if (node.update) c(node.update, st, "Expression")
    // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
    buffer.concat(")")
    if (node.body.type !== "EmptyStatement") buffer.concat("\n")
    st.compiler.indentation += st.compiler.indentStep
    c(body, st, "Statement")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
  },
  ForInStatement: function(node, st, c) {
    let compiler = st.compiler,
        body = node.body,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("for (", node)
    c(node.left, st, "ForInit")
    buffer.concat(" in ")
    c(node.right, st, "Expression")
    // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
    buffer.concat(body.type === "EmptyStatement" ? ")\n" : ")\n")
    st.compiler.indentation += st.compiler.indentStep
    c(body, st, "Statement")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
  },
  ForOfStatement: function(node, st, c) { // TODO: Fix code duplication with 'for in'-
    let compiler = st.compiler,
        body = node.body,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat("for", node)
    if (node.await) buffer.concat(" await ")
    buffer.concat("(")
    c(node.left, st, "ForInit")
    buffer.concat(" of ")
    c(node.right, st, "Expression")
    // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
    buffer.concat(body.type === "EmptyStatement" ? ")\n" : ")\n")
    st.compiler.indentation += st.compiler.indentStep
    c(body, st, "Statement")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
  },
  ForInit: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    if (node.type === "VariableDeclaration") {
      st.isFor = true
      c(node, st)
      delete st.isFor
    } else if (node.type === "BinaryExpression" && node.operator === "in") {
      buffer.concat("(")
      c(node, st, "Expression")
      buffer.concat(")")
    } else {
      c(node, st, "Expression")
    }
  },
  DebuggerStatement: function(node, st, c) {
    let compiler = st.compiler
    let buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("debugger;\n", node)
  },
  Function: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer,
        inner = new FunctionScope(st),
        decl = node.type === "FunctionDeclaration",
        id = node.id

    inner.isDecl = decl
    for (let i = 0; i < node.params.length; ++i)
      inner.vars[node.params[i].name] = {type: "argument", node: node.params[i]}
    buffer.concat(st.compiler.indentation)
    if (id) {
      let name = id.name;
      (decl ? st : inner).vars[name] = {type: decl ? "function" : "function name", node: id}
      if (compiler.transformNamedFunctionDeclarationToAssignment) {
        buffer.concat(name)
        buffer.concat(" = ")
      }
    }
    if (st.isDefaultExport && !decl) buffer.concat("(")
    let prefix = []
    if (st.methodPrefix?.length) {
      prefix.push(...st.methodPrefix)
    }
    if (node.async) prefix.push("async")
    if (!st.skipFunctionKeyword) {
      prefix.push("function")
    }
    if (node.generator) prefix.push("*")
    buffer.concat(prefix.join(" "))
    if (!compiler.transformNamedFunctionDeclarationToAssignment && id) {
      buffer.concat(" ")
      if (st.isComputed) buffer.concat("[")
      c(id, st)
      if (st.isComputed) buffer.concat("]")
    }
    buffer.concat("(")
    for (let i = 0; i < node.params.length; ++i) {
      if (i)
        buffer.concat(", ")
      if (node.params[i].type === "RestElement") {
        c(node.params[i], st, "RestElement")
      } else {
        c(node.params[i], st, "Pattern")
      }
    }
    buffer.concat(")\n")
    st.compiler.indentation += st.compiler.indentStep
    inner.endOfScopeBody = true
    c(node.body, inner, "Statement")
    if (st.isDefaultExport && !decl) buffer.concat(")")
    inner.variablesNotReadWarnings()
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    inner.copyAddedSelfToIvarsToParent()
  },
  ObjectPattern: function(node, st, c) {
    c(node, st, "ObjectExpression")
  },
  RestElement: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    buffer.concat("...")
    c(node.argument, st)
  },
  EmptyStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    buffer.concat(";\n")
  },
  VariableDeclaration: function(node, st, c) {
    const compiler = st.compiler
    const buffer = compiler.jsBuffer
    const isVar = node.kind === "var"
    const varScope = isVar ? st.getVarScope() : st

    if (!st.isFor) buffer.concat(compiler.indentation)
    buffer.concat(node.kind + " ", node)
    let isFirst = true
    for (const decl of node.declarations) {
      const identifier = decl.id.name
      let possibleHoistedVariable = isVar && varScope.possibleHoistedVariables?.[identifier]
      let variableDeclaration = {type: node.kind, node: decl.id, isRead: (possibleHoistedVariable ? possibleHoistedVariable.isRead : 0)}

      // Make sure we count the access for this varaible if it is hoisted.
      // Check if this variable has already been accessed above this declaration
      if (possibleHoistedVariable) {
        // 'variableDeclaration' is already marked as read. This was done by adding the already read amount above.

        // Substract the same amount from possible local variable higher up in the hierarchy that is shadowed by this declaration
        if (possibleHoistedVariable.variable) {
          possibleHoistedVariable.variable.isRead -= possibleHoistedVariable.isRead
        }
        // Remove it as we don't need to care about this variable anymore.
        varScope.possibleHoistedVariables[identifier] = null
      }
      varScope.vars[identifier] = variableDeclaration

      if (!isFirst) {
        if (st.isFor)
          buffer.concat(", ")
        else {
          buffer.concat(",\n")
          buffer.concat(compiler.indentation)
          buffer.concat("    ")
        }
      }

      c(decl.id, st, "Pattern")
      if (decl.init) {
        buffer.concat(" = ")
        c(decl.init, st, "Expression")
      }
      // FIXME: Extract to function
      // Here we check back if a ivar with the same name exists and if we have prefixed 'self.' on previous uses.
      // If this is the case we have to remove the prefixes and issue a warning that the variable hides the ivar.
      if (st.addedSelfToIvars) {
        let addedSelfToIvar = st.addedSelfToIvars[identifier]
        if (addedSelfToIvar) {
          let size = addedSelfToIvar.length
          for (let i = 0; i < size; i++) {
            let dict = addedSelfToIvar[i]
            buffer.removeAtIndex(dict.index)
            if (compiler.options.warnings.includes(warningShadowIvar)) compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", dict.node, compiler.source))
          }
          // Add a read mark to the local variable for each time it is used.
          variableDeclaration.isRead += size
          // Remove the variable from list of instance variable uses.
          st.addedSelfToIvars[identifier] = []
        }
      }
      if (isFirst) isFirst = false
    }
    if (!st.isFor) buffer.concat(";\n", node) // Don't add ';' if this is a for statement but do it if this is a statement
  },
  ThisExpression: function(node, st, c) {
    let compiler = st.compiler

    compiler.jsBuffer.concat("this", node)
  },
  ArrayExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer

    buffer = compiler.jsBuffer
    buffer.concat("[", node)

    for (let i = 0; i < node.elements.length; ++i) {
      let elt = node.elements[i]

      if (i !== 0)
        buffer.concat(", ")

      if (elt) c(elt, st, "Expression")
    }
    buffer.concat("]")
  },
  ObjectExpression: function(node, st, c) {
    const compiler = st.compiler
    const buffer = compiler.jsBuffer

    buffer.concat("{", node)
    let isFirst = true
    for (const prop of node.properties) {
      if (!isFirst) {
        buffer.concat(", ")
      } else {
        isFirst = false
      }
      c(prop, st)
    }
    buffer.concat("}")
  },
  Property: function(node, st, c) {
    const compiler = st.compiler
    const buffer = compiler.jsBuffer
    if (node.value?.type === "AssignmentPattern" && node.shorthand) {
      c(node.value, st, "AssignmentPattern")
    } else if (node.kind === "get" || node.kind === "set" || node.method) {
      buffer.concat((node.method ? "" : node.kind) + " ")
      node.value.id = node.key
      st.isComputed = node.computed
      st.skipFunctionKeyword = true
      c(node.value, st, "Expression")
      delete st.skipFunctionKeyword
      delete st.isComputed
    } else {
      if (node.computed) buffer.concat("[")
      st.isPropertyKey = true
      c(node.key, st, "Expression")
      delete st.isPropertyKey
      if (node.computed) buffer.concat("]")
      if (!node.shorthand) {
        buffer.concat(": ")
      }
      if (!node.shorthand) c(node.value, st, "Expression")
    }
  },
  StaticBlock: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    buffer.concat(st.compiler.indentation)
    buffer.concat("static")
    buffer.concat("{")
    for (let i = 0; i < node.body.length; ++i) {
      c(node.body[i], st, "Statement")
    }
    buffer.concat("}")
  },
  SpreadElement: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    buffer.concat("...")
    c(node.argument, st)
  },
  SequenceExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat("(", node)
    for (let i = 0; i < node.expressions.length; ++i) {
      if (i !== 0)
        buffer.concat(", ")
      c(node.expressions[i], st, "Expression")
    }
    buffer.concat(")")
  },
  UnaryExpression: function(node, st, c) {
    let compiler = st.compiler,
        argument = node.argument
    let buffer = compiler.jsBuffer
    if (node.prefix) {
      buffer.concat(node.operator, node)
      if (wordPrefixOperators.test(node.operator))
        buffer.concat(" ");
      (nodePrecedence(node, argument) ? surroundExpression(c) : c)(argument, st, "Expression")
    } else {
      (nodePrecedence(node, argument) ? surroundExpression(c) : c)(argument, st, "Expression")
      buffer.concat(node.operator)
    }
  },
  UpdateExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    if (node.argument.type === "Dereference") {
      checkCanDereference(st, node.argument)

      // @deref(x)++ and ++@deref(x) require special handling.

      // Output the dereference function, "(...)(z)"
      buffer.concat((node.prefix ? "" : "(") + "(")

      // The thing being dereferenced.
      c(node.argument.expr, st, "Expression")
      buffer.concat(")(")

      c(node.argument, st, "Expression")
      buffer.concat(" " + node.operator.substring(0, 1) + " 1)" + (node.prefix ? "" : node.operator === "++" ? " - 1)" : " + 1)"))

      return
    }

    if (node.prefix) {
      buffer.concat(node.operator, node)
      if (wordPrefixOperators.test(node.operator))
        buffer.concat(" ");
      (nodePrecedence(node, node.argument) ? surroundExpression(c) : c)(node.argument, st, "Expression")
    } else {
      (nodePrecedence(node, node.argument) ? surroundExpression(c) : c)(node.argument, st, "Expression")
      buffer.concat(node.operator)
    }
  },
  BinaryExpression: function(node, st, c) {
    let compiler = st.compiler
    if (node.operator === "**" || node.left.type === "ArrowFunctionExpression") {
      surroundExpression(c)(node.left, st, "Expression")
    } else {
      (nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, "Expression")
    }
    let buffer = compiler.jsBuffer
    buffer.concat(" ")
    buffer.concat(node.operator, node)
    buffer.concat(" ");
    (nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression")
  },
  LogicalExpression: function(node, st, c) {
    let compiler = st.compiler
    if (node.operator === "??") {
      surroundExpression(c)(node.left, st, "Expression")
    } else {
      (nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, "Expression")
    }
    let buffer = compiler.jsBuffer
    buffer.concat(" ")
    buffer.concat(node.operator)
    buffer.concat(" ")
    if (node.operator === "??") {
      surroundExpression(c)(node.right, st, "Expression")
    } else {
      (nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression")
    }
  },
  ParenthesizedExpression: function(node, st, c) {
    const buffer = st.compiler.jsBuffer
    buffer.concat("(")
    c(node.expression, st, "Expression")
    buffer.concat(")")
  },
  AssignmentExpression: function(node, st, c) {
    let compiler = st.compiler,
        saveAssignment = st.assignment,
        buffer = compiler.jsBuffer

    if (node.left.type === "Dereference") {
      checkCanDereference(st, node.left)

      // @deref(x) = z    -> x(z) etc

      // Output the dereference function, "(...)(z)"
      buffer.concat("(", node)
      // What's being dereferenced could itself be an expression, such as when dereferencing a deref.
      c(node.left.expr, st, "Expression")
      buffer.concat(")(")

      // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
      if (node.operator !== "=") {
        // Output the whole .left, not just .left.expr.
        c(node.left, st, "Expression")
        buffer.concat(" " + node.operator.substring(0, 1) + " ")
      }

      c(node.right, st, "Expression")
      buffer.concat(")")

      return
    }

    saveAssignment = st.assignment
    let nodeLeft = node.left

    st.assignment = true
    if (nodeLeft.type === "Identifier" && nodeLeft.name === "self") {
      let lVar = st.getLvar("self", true)
      if (lVar) {
        let lvarScope = lVar.scope
        if (lvarScope)
          lvarScope.assignmentToSelf = true
      }
    }
    (nodePrecedence(node, nodeLeft) ? surroundExpression(c) : c)(nodeLeft, st, "Expression")
    buffer.concat(" ")
    buffer.concat(node.operator)
    buffer.concat(" ")
    st.assignment = saveAssignment;
    (nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression")
    let varScope = st.getVarScope()
    if (varScope.isRootScope() && nodeLeft.type === "Identifier" && !varScope.getLvar(nodeLeft.name))
      varScope.vars[nodeLeft.name] = {type: "global", node: nodeLeft}
  },
  AssignmentPattern: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    c(node.left, st, "Pattern")
    buffer.concat(" = ")
    c(node.right, st, "Expression")
  },
  ArrayPattern: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    buffer.concat("[")
    let isFirst = true
    for (const element of node.elements) {
      if (!isFirst || element == null) {
        buffer.concat(", ")
      } else {
        isFirst = false
      }
      if (element != null) c(element, st)
    }
    buffer.concat("]")
  },
  TemplateLiteral: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    buffer.concat("`")
    let i
    for (i = 0; i < node.expressions.length; i++) {
      buffer.concat(node.quasis[i].value.raw)
      buffer.concat("${")
      c(node.expressions[i], st)
      buffer.concat("}")
    }
    buffer.concat(node.quasis[i].value.raw)
    buffer.concat("`")
  },
  TaggedTemplateExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    if (node.tag.type === "ChainExpression") buffer.concat("(")
    c(node.tag, st, "Expression")
    if (node.tag.type === "ChainExpression") buffer.concat(")")
    c(node.quasi, st, "Expression")
  },
  ConditionalExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer;
    (nodePrecedence(node, node.test) ? surroundExpression(c) : c)(node.test, st, "Expression")
    buffer = compiler.jsBuffer
    buffer.concat(" ? ")
    c(node.consequent, st, "Expression")
    buffer.concat(" : ")
    c(node.alternate, st, "Expression")
  },
  NewExpression: function(node, st, c) {
    let compiler = st.compiler,
        nodeArguments = node.arguments,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat("new ", node);
    (nodePrecedence(node, node.callee) ? surroundExpression(c) : c)(node.callee, st, "Expression")
    buffer.concat("(")
    if (nodeArguments) {
      for (let i = 0, size = nodeArguments.length; i < size; ++i) {
        if (i)
          buffer.concat(", ")
        c(nodeArguments[i], st, "Expression")
      }
    }
    buffer.concat(")")
  },
  CallExpression: function(node, st, c) {
    let compiler = st.compiler,
        nodeArguments = node.arguments,
        callee = node.callee,
        buffer

    // If call to function 'eval' we assume that 'self' can be altered and from this point
    // we check if 'self' is null before 'objj_msgSend' is called with 'self' as receiver.
    if (callee.type === "Identifier" && callee.name === "eval") {
      let selfLvar = st.getLvar("self", true)
      if (selfLvar) {
        let selfScope = selfLvar.scope
        if (selfScope) {
          selfScope.assignmentToSelf = true
        }
      }
    }

    (nodePrecedence(node, callee) ? surroundExpression(c) : c)(callee, st, "Expression")
    buffer = compiler.jsBuffer
    if (node.optional) buffer.concat("?.")
    buffer.concat("(")
    if (nodeArguments) {
      for (let i = 0, size = nodeArguments.length; i < size; ++i) {
        if (i)
          buffer.concat(", ")
        c(nodeArguments[i], st, "Expression")
      }
    }
    buffer.concat(")")
  },
  MemberExpression: function(node, st, c) {
    let compiler = st.compiler,
        computed = node.computed;
    (nodePrecedence(node, node.object) ? surroundExpression(c) : c)(node.object, st, "Expression")
    let s = ""
    if (node.optional && node.computed) {
      s = "?.["
    } else if (node.optional) {
      s = "?."
    } else if (node.computed) {
      s = "["
    } else {
      s = "."
    }
    compiler.jsBuffer.concat(s)
    st.secondMemberExpression = !computed;
    // No parentheses when it is computed, '[' and ']' are the same thing.
    (!computed && nodePrecedence(node, node.property) ? surroundExpression(c) : c)(node.property, st, "Expression")
    st.secondMemberExpression = false
    if (computed)
      compiler.jsBuffer.concat("]")
  },
  ChainExpression: function(node, st, c) {
    c(node.expression, st)
  },
  AwaitExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat("await", node)
    if (node.argument) {
      buffer.concat(" ")
      buffer.concat("(")
      c(node.argument, st, "Expression")
      buffer.concat(")")
    }
  },
  ArrowFunctionExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer,
        inner = new FunctionScope(st)
    inner.isDecl = false
    for (let i = 0; i < node.params.length; ++i)
      inner.vars[node.params[i].name] = {type: "argument", node: node.params[i]}
    if (node.async) buffer.concat("async ")
    let needParentheses = mustHaveParentheses(node.params)
    if (needParentheses) buffer.concat("(")
    let isFirst = true
    for (const param of node.params) {
      if (isFirst) {
        isFirst = false
      } else {
        buffer.concat(", ")
      }
      c(param, st, "Pattern")
    }
    if (needParentheses) buffer.concat(")")
    buffer.concat(" => ")
    if (node.expression) {
      if ((node.body.type === "AssignmentExpression" && node.body.left.type === "ObjectPattern") || node.body.type === "FunctionExpression" || node.body.type === "ObjectExpression") {
        surroundExpression(c)(node.body, inner, "Expression")
      } else {
        c(node.body, inner, "Expression")
      }
    } else {
      inner.skipIndentation = true
      inner.endOfScopeBody = true
      st.compiler.indentation += st.compiler.indentStep
      c(node.body, inner, "BlockStatement")
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    }
    inner.variablesNotReadWarnings()
    inner.copyAddedSelfToIvarsToParent()
  },
  Identifier: function(node, st, c) {
    const compiler = st.compiler
    const buffer = compiler.jsBuffer
    const identifier = node.name

    if (st.isPropertyKey) {
      buffer.concat(identifier, node, identifier === "self" ? "self" : null)
      return
    }

    let lvarScope = st.getLvarScope(identifier, true) // Only look inside method/function scope
    let lvar = lvarScope.vars?.[identifier]

    if (!st.secondMemberExpression && st.currentMethodType() === "-") {
      let ivar = compiler.getIvarForClass(identifier, st)
      if (ivar) {
        if (lvar) {
          if (compiler.options.warnings.includes(warningShadowIvar)) compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", node, compiler.source))
        } else {
          // Save the index in where the "self." string is stored and the node.
          // These will be used if we find a variable declaration that is hoisting this identifier.
          ((st.addedSelfToIvars || (st.addedSelfToIvars = Object.create(null)))[identifier] || (st.addedSelfToIvars[identifier] = [])).push({node, index: buffer.length()})
          buffer.concat("self.", node)
        }
      } else if (!reservedIdentifiers.test(identifier)) { // Don't check for warnings if it is a reserved word like self, localStorage, _cmd, etc...
        let message,
            classOrGlobal = typeof global[identifier] !== "undefined" || (typeof window !== "undefined" && typeof window[identifier] !== "undefined") || compiler.getClassDef(identifier),
            globalVar = st.getLvar(identifier)
        if (classOrGlobal && (!globalVar || globalVar.type !== "class")) { // It can't be declared with a @class statement.
          /* Turned off this warning as there are many many warnings when compiling the Cappuccino frameworks - Martin
          if (lvar) {
              message = compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides global variable", node, compiler.source));
          } */
        } else if (!globalVar) {
          if (st.assignment && compiler.options.warnings.includes(warningCreateGlobalInsideFunctionOrMethod)) {
            message = new GlobalVariableMaybeWarning("Creating global variable inside function or method '" + identifier + "'", node, compiler.source)
            // Turn off these warnings for this identifier, we only want one.
            st.vars[identifier] = {type: "remove global warning", node}
          } else if (compiler.options.warnings.includes(warningUnknownClassOrGlobal)) {
            message = new GlobalVariableMaybeWarning("Using unknown class or uninitialized global variable '" + identifier + "'", node, compiler.source)
          }
        }
        if (message)
          st.addMaybeWarning(message)
      }
    }
    if (!(st.assignment && st.secondMemberExpression)) {
      if (lvar) {
        lvar.isRead++
      } else {
        // If the var is not declared in current var scope (function scope) we need to save which var it is as it can be hoisted.
        // First check if the variable is declared higher up in the scope hierarchy
        lvarScope = lvarScope.getLvarScope(identifier)
        lvar = lvarScope.vars && lvarScope.vars[identifier]
        // We will mark it as read.
        if (lvar) {
          lvar.isRead++
        }

        // The variable can be declared later on in this function / method scope.
        // It can also be declared later on in a higher scope.
        // We create a list of possible variables that will be used if it is declared.
        // We collect how many times the variable is read and a reference to a possible variable in a
        let possibleHoistedVariable = (lvarScope.possibleHoistedVariables || (lvarScope.possibleHoistedVariables = Object.create(null)))[identifier]

        if (possibleHoistedVariable == null) {
          possibleHoistedVariable = {isRead: 1}
          lvarScope.possibleHoistedVariables[identifier] = possibleHoistedVariable
        } else {
          possibleHoistedVariable.isRead++
        }

        if (lvar) {
          // If the var and scope are already set it should not be different from what we found now.
          if ((possibleHoistedVariable.variable && possibleHoistedVariable.variable !== lvar) || (possibleHoistedVariable.varScope && possibleHoistedVariable.varScope !== lvarScope)) {
            throw new Error("Internal inconsistency, var or scope is not the same")
          }
          possibleHoistedVariable.variable = lvar
          possibleHoistedVariable.varScope = lvarScope
        }
      }
    }
    buffer.concat(identifier, node, identifier === "self" ? "self" : null)
  },
  YieldExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer
    buffer = compiler.jsBuffer
    buffer.concat("yield", node)
    if (node.delegate) buffer.concat("*")
    if (node.argument) {
      buffer.concat(" ")
      c(node.argument, st, "Expression")
    }
  },
  // Use this when there should not be a look up to issue warnings or add 'self.' before ivars
  VariablePattern: function(node, st, c) {
    let compiler = st.compiler
    compiler.jsBuffer.concat(node.name, node)
  },
  Literal: function(node, st, c) {
    let compiler = st.compiler
    if (node.raw)
      if (node.raw.charAt(0) === "@")
        compiler.jsBuffer.concat(node.raw.substring(1), node)
      else
        compiler.jsBuffer.concat(node.raw, node)
    else {
      let value = node.value,
          doubleQuote = value.indexOf("\"") !== -1
      compiler.jsBuffer.concat(doubleQuote ? "'" : "\"", node)
      compiler.jsBuffer.concat(value)
      compiler.jsBuffer.concat(doubleQuote ? "'" : "\"")
    }
  },
  ClassDeclaration: function(node, st, c) {
    const buffer = st.compiler.jsBuffer
    if (node.type === "ClassExpression") buffer.concat("(")
    buffer.concat("class ")
    if (node.id) c(node.id, st)
    if (node.superClass) {
      buffer.concat(" extends ")
      c(node.superClass, st)
    }
    st.compiler.indentation += st.compiler.indentStep
    c(node.body, st, "ClassBody")
    st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)
    if (node.type === "ClassExpression") buffer.concat(")")
  },
  ClassExpression: function(node, st, c) {
    c(node, st, "ClassDeclaration")
  },
  ClassBody: function(node, st, c) {
    let compiler = st.compiler
    compiler.jsBuffer.concat(" {\n")
    for (let element of node.body) {
      c(element, st)
      compiler.jsBuffer.concat("\n")
    }
    compiler.jsBuffer.concat("}\n")
  },
  PropertyDefinition: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    buffer.concat(st.compiler.indentation)
    if (node.static) buffer.concat("static ")
    if (node.computed) buffer.concat("[")
    c(node.key, st)
    if (node.computed) buffer.concat("]")
    if (node.value) {
      buffer.concat(" = ")
      c(node.value, st)
    }
    buffer.concat(";")
  },
  MethodDefinition: function(node, st, c) {
    let prefix = []
    if (node.static) prefix.push("static")
    if (node.kind === "get") prefix.push("get")
    if (node.kind === "set") prefix.push("set")

    node.value.id = node.key
    st.skipFunctionKeyword = true
    st.methodPrefix = prefix
    if (node.computed) st.isComputed = true
    c(node.value, st)
    delete st.methodPrefix
    st.isComputed = false
    st.skipFunctionKeyword = false
  },
  PrivateIdentifier: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    buffer.concat("#")
    buffer.concat(node.name)
  },
  MetaProperty: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    // Very specific special cases. Apparently this will be used in future versions of ES.
    if (node.meta.name === "import") {
      buffer.concat("import.meta")
    } else {
      buffer.concat("new.target")
    }
  },
  Super: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    buffer.concat("super")
  },
  ExportNamedDeclaration: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    // The different cases we can have when we encounter an 'ExportNamedDeclaration'
    // Case 1: declaration is non-null, specifiers are null, source is null. Example: export var foo = 1.
    // Case 2: declaration is null, specifiers are non-null, source is null
    // Case 3: declaration is null, specifiers are non-null, source is non-null

    buffer.concat("export ")
    if (node.declaration) {
      c(node.declaration, st)
    } else {
      buffer.concat("{")
      let isFirst = true
      for (const specifier of node.specifiers) {
        if (!isFirst) {
          buffer.concat(", ")
        } else {
          isFirst = false
        }
        c(specifier, st)
      }
      buffer.concat("}")
      if (node.source) {
        buffer.concat(" from ")
        c(node.source, st)
      }
    }
    buffer.concat("\n")
  },
  ExportSpecifier: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    c(node.local, st)
    if (node.local !== node.exported) {
      buffer.concat(" as ")
      c(node.exported, st)
    }
  },
  ExportDefaultDeclaration: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    st.isDefaultExport = true
    buffer.concat("export default ")
    c(node.declaration, st)
    delete st.isDefaultExport
  },
  ExportAllDeclaration: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer
    buffer.concat("export * ")
    if (node.exported) {
      buffer.concat("as ")
      c(node.exported, st)
    }
    if (node.source) {
      buffer.concat(" from ")
      c(node.source, st)
    }
    buffer.concat("\n")
  },
  ImportDeclaration: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    buffer.concat("import ")
    let startedCurly = false
    let isFirst = true
    for (const specifier of node.specifiers) {
      if (!isFirst) buffer.concat(", ")
      else isFirst = false
      switch (specifier.type) {
      case "ImportSpecifier":
        if (!startedCurly) buffer.concat("{")
        startedCurly = true
        c(specifier.imported, st)
        if (specifier.local !== specifier.imported) {
          buffer.concat(" as ")
          c(specifier.local, st)
        }
        break
      case "ImportDefaultSpecifier":
        c(specifier.local, st)
        break
      case "ImportNamespaceSpecifier":
        buffer.concat("* as ")
        c(specifier.local, st)
        break
      }
    }
    if (startedCurly) buffer.concat("}")
    if (node.specifiers.length > 0) buffer.concat(" from ")
    c(node.source, st)
    buffer.concat("\n")
  },
  ImportExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    buffer.concat("import")
    buffer.concat("(")
    c(node.source, st)
    buffer.concat(")")
  },
  ArrayLiteral: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer,
        elementLength = node.elements.length,
        varScope = st.getVarScope()

    if (!varScope.receiverLevel) varScope.receiverLevel = 0
    if (!elementLength) {
      if (compiler.options.inlineMsgSendFunctions) {
        buffer.concat("(___r", node)
        buffer.concat(++varScope.receiverLevel + "")
        buffer.concat(" = (CPArray.isa.method_msgSend[\"alloc\"] || _objj_forward)(CPArray, \"alloc\"), ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" == null ? ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" : (___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(".isa.method_msgSend[\"init\"] || _objj_forward)(___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(", \"init\"))")
      } else {
        buffer.concat("(___r")
        buffer.concat(++varScope.receiverLevel + "")
        buffer.concat(" = CPArray.isa.objj_msgSend0(CPArray, \"alloc\"), ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" == null ? ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" : ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(".isa.objj_msgSend0(___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(", \"init\"))")
      }

      if (!(varScope.maxReceiverLevel >= varScope.receiverLevel))
        varScope.maxReceiverLevel = varScope.receiverLevel
    } else {
      if (compiler.options.inlineMsgSendFunctions) {
        buffer.concat("(___r", node)
        buffer.concat(++varScope.receiverLevel + "")
        buffer.concat(" = (CPArray.isa.method_msgSend[\"alloc\"] || _objj_forward)(CPArray, \"alloc\"), ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" == null ? ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" : (___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(".isa.method_msgSend[\"initWithObjects:count:\"] || _objj_forward)(___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(", \"initWithObjects:count:\", [")
      } else {
        buffer.concat("(___r", node)
        buffer.concat(++varScope.receiverLevel + "")
        buffer.concat(" = CPArray.isa.objj_msgSend0(CPArray, \"alloc\"), ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" == null ? ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" : ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(".isa.objj_msgSend2(___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(", \"initWithObjects:count:\", [")
      }

      if (!(varScope.maxReceiverLevel >= varScope.receiverLevel))
        varScope.maxReceiverLevel = varScope.receiverLevel
    }
    if (elementLength) {
      for (let i = 0; i < elementLength; i++) {
        let elt = node.elements[i]

        if (i)
          buffer.concat(", ")

        c(elt, st, "Expression")
      }
      buffer.concat("], " + elementLength + "))")
    }
    varScope.receiverLevel--
  },
  DictionaryLiteral: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer,
        keyLength = node.keys.length,
        varScope = st.getVarScope()

    if (!varScope.receiverLevel) varScope.receiverLevel = 0
    if (!keyLength) {
      if (compiler.options.inlineMsgSendFunctions) {
        buffer.concat("(___r", node)
        buffer.concat(++varScope.receiverLevel + "")
        buffer.concat(" = (CPDictionary.isa.method_msgSend[\"alloc\"] || _objj_forward)(CPDictionary, \"alloc\"), ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" == null ? ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" : (___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(".isa.method_msgSend[\"init\"] || _objj_forward)(___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(", \"init\"))")
      } else {
        buffer.concat("(___r")
        buffer.concat(++varScope.receiverLevel + "")
        buffer.concat(" = CPDictionary.isa.objj_msgSend0(CPDictionary, \"alloc\"), ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" == null ? ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" : ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(".isa.objj_msgSend0(___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(", \"init\"))")
      }

      if (!(varScope.maxReceiverLevel >= varScope.receiverLevel))
        varScope.maxReceiverLevel = varScope.receiverLevel
    } else {
      if (compiler.options.inlineMsgSendFunctions) {
        buffer.concat("(___r", node)
        buffer.concat(++varScope.receiverLevel + "")
        buffer.concat(" = (CPDictionary.isa.method_msgSend[\"alloc\"] || _objj_forward)(CPDictionary, \"alloc\"), ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" == null ? ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" : (___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(".isa.method_msgSend[\"initWithObjects:forKeys:\"] || _objj_forward)(___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(", \"initWithObjects:forKeys:\", [")
      } else {
        buffer.concat("(___r", node)
        buffer.concat(++varScope.receiverLevel + "")
        buffer.concat(" = CPDictionary.isa.objj_msgSend0(CPDictionary, \"alloc\"), ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" == null ? ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(" : ___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(".isa.objj_msgSend2(___r")
        buffer.concat(varScope.receiverLevel + "")
        buffer.concat(", \"initWithObjects:forKeys:\", [")
      }

      if (!(varScope.maxReceiverLevel >= varScope.receiverLevel))
        varScope.maxReceiverLevel = varScope.receiverLevel

      for (let i = 0; i < keyLength; i++) {
        let value = node.values[i]

        if (i) buffer.concat(", ")
        c(value, st, "Expression")
      }

      buffer.concat("], [")

      for (let i = 0; i < keyLength; i++) {
        let key = node.keys[i]

        if (i) buffer.concat(", ")

        c(key, st, "Expression")
      }
      buffer.concat("]))")
    }
    varScope.receiverLevel--
  },
  ImportStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer,
        localfilepath = node.localfilepath
    buffer.concat("objj_executeFile(\"", node)
    buffer.concat(node.filename.value)
    buffer.concat(localfilepath ? "\", YES);" : "\", NO);")
  },
  ClassDeclarationStatement: function(node, st, c) {
    let compiler = st.compiler,
        saveJSBuffer = compiler.jsBuffer,
        className = node.classname.name,
        classDef = compiler.getClassDef(className),
        classScope = new Scope(st),
        isInterfaceDeclaration = node.type === "InterfaceDeclarationStatement",
        protocols = node.protocols,
        options = compiler.options

    compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL, options.sourceMap && options.sourceMapIncludeSource ? compiler.source : null)
    compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL)
    compiler.classBodyBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL) // TODO: Check if this is needed

    if (compiler.getTypeDef(className))
      throw compiler.error_message(className + " is already declared as a type", node.classname)

    // First we declare the class
    if (node.superclassname) {
      // Must have methods dictionaries and ivars dictionary to be a real implementaion declaration.
      // Without it is a "@class" declaration (without both ivars dictionary and method dictionaries) or
      // "interface" declaration (without ivars dictionary)
      // TODO: Create a ClassDef object and add this logic to it
      if (classDef && classDef.ivars)
        // It has a real implementation declaration already
        throw compiler.error_message("Duplicate class " + className, node.classname)

      if (isInterfaceDeclaration && classDef && classDef.instanceMethods && classDef.classMethods)
        // It has a interface declaration already
        throw compiler.error_message("Duplicate interface definition for class " + className, node.classname)
      let superClassDef = compiler.getClassDef(node.superclassname.name)
      if (!superClassDef) { // Don't throw error for this when generating Objective-J code
        let errorMessage = "Can't find superclass " + node.superclassname.name
        let stack = compiler.constructor.importStack
        if (stack) for (let i = compiler.constructor.importStack.length; --i >= 0;)
          errorMessage += "\n" + Array((stack.length - i) * 2 + 1).join(" ") + "Imported by: " + stack[i]
        throw compiler.error_message(errorMessage, node.superclassname)
      }

      classDef = new ClassDef(!isInterfaceDeclaration, className, superClassDef, Object.create(null))

      saveJSBuffer.concat("\n{var the_class = objj_allocateClassPair(" + node.superclassname.name + ", \"" + className + "\"),\nmeta_class = the_class.isa;", node)
    } else if (node.categoryname) {
      classDef = compiler.getClassDef(className)
      if (!classDef)
        throw compiler.error_message("Class " + className + " not found ", node.classname)

      saveJSBuffer.concat("{\nvar the_class = objj_getClass(\"" + className + "\")\n", node)
      saveJSBuffer.concat("if(!the_class) throw new SyntaxError(\"*** Could not find definition for class \\\"" + className + "\\\"\");\n")
      saveJSBuffer.concat("var meta_class = the_class.isa;")
    } else {
      classDef = new ClassDef(!isInterfaceDeclaration, className, null, Object.create(null))

      saveJSBuffer.concat("{var the_class = objj_allocateClassPair(Nil, \"" + className + "\"),\nmeta_class = the_class.isa;", node)
    }

    if (protocols) for (let i = 0, size = protocols.length; i < size; i++) {
      saveJSBuffer.concat("\nvar aProtocol = objj_getProtocol(\"" + protocols[i].name + "\");", protocols[i])
      saveJSBuffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocols[i].name + "\\\"\");")
      saveJSBuffer.concat("\nclass_addProtocol(the_class, aProtocol);")
    }
    /*
            if (isInterfaceDeclaration)
                classDef.interfaceDeclaration = true;
        */
    classScope.classDef = classDef
    compiler.currentSuperClass = "objj_getClass(\"" + className + "\").super_class"
    compiler.currentSuperMetaClass = "objj_getMetaClass(\"" + className + "\").super_class"

    let firstIvarDeclaration = true,
        ivars = classDef.ivars,
        classDefIvars = [],
        hasAccessors = false

    // Then we add all ivars
    if (node.ivardeclarations) {
      for (let i = 0; i < node.ivardeclarations.length; ++i) {
        let ivarDecl = node.ivardeclarations[i],
            ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarTypeIsClass = ivarDecl.ivartype ? ivarDecl.ivartype.typeisclass : false,
            ivarIdentifier = ivarDecl.id,
            ivarName = ivarIdentifier.name,
            ivar = {type: ivarType, name: ivarName},
            accessors = ivarDecl.accessors

        let checkIfIvarIsAlreadyDeclaredAndInSuperClass = function(aClassDef, recursiveFunction) {
          if (aClassDef.ivars[ivarName])
            throw compiler.error_message("Instance variable '" + ivarName + "' is already declared for class " + className + (aClassDef.name !== className ? " in superclass " + aClassDef.name : ""), ivarDecl.id)
          if (aClassDef.superClass)
            recursiveFunction(aClassDef.superClass, recursiveFunction)
        }

        // Check if ivar is already declared in this class or its super classes.
        checkIfIvarIsAlreadyDeclaredAndInSuperClass(classDef, checkIfIvarIsAlreadyDeclaredAndInSuperClass)

        let isTypeDefined = !ivarTypeIsClass || typeof global[ivarType] !== "undefined" || (typeof window !== "undefined" && typeof window[ivarType] !== "undefined") ||
          compiler.getClassDef(ivarType) || compiler.getTypeDef(ivarType) || ivarType === classDef.name

        if (!isTypeDefined && compiler.options.warnings.includes(warningUnknownIvarType))
          compiler.addWarning(createMessage("Unknown type '" + ivarType + "' for ivar '" + ivarName + "'", ivarDecl.ivartype, compiler.source))

        if (firstIvarDeclaration) {
          firstIvarDeclaration = false
          saveJSBuffer.concat("class_addIvars(the_class, [")
        } else
          saveJSBuffer.concat(", ")

        if (options.includeIvarTypeSignatures)
          saveJSBuffer.concat("new objj_ivar(\"" + ivarName + "\", \"" + ivarType + "\")", node)
        else
          saveJSBuffer.concat("new objj_ivar(\"" + ivarName + "\")", node)

        if (ivarDecl.outlet)
          ivar.outlet = true

        // Store the classDef ivars into array and add them later when accessors are created to prevent ivar duplicate error when generating accessors
        classDefIvars.push(ivar)

        if (!classScope.ivars)
          classScope.ivars = Object.create(null)
        classScope.ivars[ivarName] = {type: "ivar", name: ivarName, node: ivarIdentifier, ivar}

        if (accessors) {
          // Declare the accessor methods in the class definition.
          // TODO: This next couple of lines for getting getterName and setterName are duplicated from below. Create functions for this.
          let property = (accessors.property && accessors.property.name) || ivarName,
              getterName = (accessors.getter && accessors.getter.name) || property

          classDef.addInstanceMethod(new MethodDef(getterName, [ivarType]))

          if (!accessors.readonly) {
            let setterName = accessors.setter ? accessors.setter.name : null

            if (!setterName) {
              let start = property.charAt(0) === "_" ? 1 : 0

              setterName = (start ? "_" : "") + "set" + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ":"
            }
            classDef.addInstanceMethod(new MethodDef(setterName, ["void", ivarType]))
          }
          hasAccessors = true
        }
      }
    }
    if (!firstIvarDeclaration)
      saveJSBuffer.concat("]);")

    // If we have accessors add get and set methods for them
    if (!isInterfaceDeclaration && hasAccessors) {
      // We pass false to the string buffer as we don't need source map when we create the Objective-J code for the accessors
      let getterSetterBuffer = new StringBuffer(false)

      // Add the class declaration to compile accessors correctly
      // Remove all protocols from class declaration
      getterSetterBuffer.concat(compiler.source.substring(node.start, node.endOfIvars).replace(/<.*>/g, ""))
      getterSetterBuffer.concat("\n")

      for (let i = 0; i < node.ivardeclarations.length; ++i) {
        let ivarDecl = node.ivardeclarations[i],
            ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarName = ivarDecl.id.name,
            accessors = ivarDecl.accessors

        if (!accessors)
          continue

        let property = (accessors.property && accessors.property.name) || ivarName,
            getterName = (accessors.getter && accessors.getter.name) || property,
            getterCode = "- (" + (ivarType || "id") + ")" + getterName + "\n{\n    return " + ivarName + ";\n}\n"

        getterSetterBuffer.concat(getterCode)

        if (accessors.readonly)
          continue

        let setterName = accessors.setter ? accessors.setter.name : null

        if (!setterName) {
          let start = property.charAt(0) === "_" ? 1 : 0

          setterName = (start ? "_" : "") + "set" + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ":"
        }

        let setterCode = "- (void)" + setterName + "(" + (ivarType || "id") + ")newValue\n{\n    "

        if (accessors.copy)
          setterCode += "if (" + ivarName + " !== newValue)\n        " + ivarName + " = [newValue copy];\n}\n"
        else
          setterCode += ivarName + " = newValue;\n}\n"

        getterSetterBuffer.concat(setterCode)
      }

      getterSetterBuffer.concat("\n@end")

      // Remove all @accessors or we will get a recursive loop in infinity
      let b = getterSetterBuffer.toString().replace(/@accessors(\(.*\))?/g, "")
      let compilerOptions = setupOptions(options)

      compilerOptions.sourceMapIncludeSource = true
      let url = compiler.url
      let filename = url && compiler.URL.substr(compiler.URL.lastIndexOf("/") + 1)
      let dotIndex = filename && filename.lastIndexOf(".")
      let filenameNoExt = filename && (filename.substr(0, dotIndex === -1 ? filename.length : dotIndex))
      let filenameExt = filename && filename.substr(dotIndex === -1 ? filename.length : dotIndex)
      let categoryname = node.categoryname && node.categoryname.id
      let imBuffer = exports.compileToIMBuffer(b, filenameNoExt + "_" + className + (categoryname ? "_" + categoryname : "") + "_Accessors" + (filenameExt || ""), compilerOptions)

      // Add the accessors methods first to instance method buffer.
      // This will allow manually added set and get methods to override the compiler generated
      let generatedCode = imBuffer.toString()

      if (compiler.createSourceMap) {
        compiler.imBuffer.concat(SourceNode.fromStringWithSourceMap(generatedCode.code, SourceMapConsumer(generatedCode.map.toString())))
      } else {
        compiler.imBuffer.concat(generatedCode)
      }
    }

    // We will store the ivars into the classDef first after accessors are done so we don't get a duplicate ivars error when generating accessors
    for (let ivarSize = classDefIvars.length, i = 0; i < ivarSize; i++) {
      let ivar = classDefIvars[i],
          ivarName = ivar.name

      // Store the ivar into the classDef
      ivars[ivarName] = ivar
    }

    // We will store the classDef first after accessors are done so we don't get a duplicate class error when generating accessors
    compiler.classDefs[className] = classDef

    let bodies = node.body,
        bodyLength = bodies.length

    if (bodyLength > 0) {
      // And last add methods and other statements
      for (let i = 0; i < bodyLength; ++i) {
        let body = bodies[i]
        c(body, classScope, "Statement")
      }
    }

    // We must make a new class object for our class definition if it's not a category
    if (!isInterfaceDeclaration && !node.categoryname) {
      saveJSBuffer.concat("objj_registerClassPair(the_class);\n")
    }

    // Add instance methods
    if (compiler.imBuffer.isEmpty()) {
      saveJSBuffer.concat("class_addMethods(the_class, [")
      saveJSBuffer.appendStringBuffer(compiler.imBuffer)
      saveJSBuffer.concat("]);\n")
    }

    // Add class methods
    if (compiler.cmBuffer.isEmpty()) {
      saveJSBuffer.concat("class_addMethods(meta_class, [")
      saveJSBuffer.appendStringBuffer(compiler.cmBuffer)
      saveJSBuffer.concat("]);\n")
    }

    saveJSBuffer.concat("}\n")

    compiler.jsBuffer = saveJSBuffer

    // Skip the "@end"

    // If the class conforms to protocols check that all required methods are implemented
    if (protocols) {
      // Lookup the protocolDefs for the protocols
      let protocolDefs = []

      for (let i = 0, size = protocols.length; i < size; i++) {
        let protocol = protocols[i],
            protocolDef = compiler.getProtocolDef(protocol.name)

        if (!protocolDef)
          throw compiler.error_message("Cannot find protocol declaration for '" + protocol.name + "'", protocol)

        protocolDefs.push(protocolDef)
      }

      let unimplementedMethods = classDef.listOfNotImplementedMethodsForProtocols(protocolDefs)

      if (unimplementedMethods && unimplementedMethods.length > 0)
        for (let j = 0, unimpSize = unimplementedMethods.length; j < unimpSize; j++) {
          let unimplementedMethod = unimplementedMethods[j],
              methodDef = unimplementedMethod.methodDef,
              protocolDef = unimplementedMethod.protocolDef

          compiler.addWarning(createMessage("Method '" + methodDef.name + "' in protocol '" + protocolDef.name + "' is not implemented", node.classname, compiler.source))
        }
    }
  },
  ProtocolDeclarationStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer,
        protocolName = node.protocolname.name,
        protocolDef = compiler.getProtocolDef(protocolName),
        protocols = node.protocols,
        protocolScope = new Scope(st),
        inheritFromProtocols = []

    if (protocolDef)
      throw compiler.error_message("Duplicate protocol " + protocolName, node.protocolname)

    compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL)
    compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL)

    buffer.concat("{var the_protocol = objj_allocateProtocol(\"" + protocolName + "\");", node)

    if (protocols) {
      for (let i = 0, size = protocols.length; i < size; i++) {
        let protocol = protocols[i],
            inheritFromProtocolName = protocol.name,
            inheritProtocolDef = compiler.getProtocolDef(inheritFromProtocolName)

        if (!inheritProtocolDef)
          throw compiler.error_message("Can't find protocol " + inheritFromProtocolName, protocol)

        buffer.concat("\nvar aProtocol = objj_getProtocol(\"" + inheritFromProtocolName + "\");", node)
        buffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocolName + "\\\"\");", node)
        buffer.concat("\nprotocol_addProtocol(the_protocol, aProtocol);", node)

        inheritFromProtocols.push(inheritProtocolDef)
      }
    }

    protocolDef = new ProtocolDef(protocolName, inheritFromProtocols)
    compiler.protocolDefs[protocolName] = protocolDef
    protocolScope.protocolDef = protocolDef

    let someRequired = node.required

    if (someRequired) {
      let requiredLength = someRequired.length

      if (requiredLength > 0) {
        // We only add the required methods
        for (let i = 0; i < requiredLength; ++i) {
          let required = someRequired[i]
          c(required, protocolScope, "Statement")
        }
      }
    }

    buffer.concat("\nobjj_registerProtocol(the_protocol);\n")

    // Add instance methods
    if (compiler.imBuffer.isEmpty()) {
      buffer.concat("protocol_addMethodDescriptions(the_protocol, [")
      buffer.appendStringBuffer(compiler.imBuffer)
      buffer.concat("], true, true);\n")
    }

    // Add class methods
    if (compiler.cmBuffer.isEmpty()) {
      buffer.concat("protocol_addMethodDescriptions(the_protocol, [")
      buffer.appendStringBuffer(compiler.cmBuffer)
      buffer.concat("], true, false);\n")
    }

    buffer.concat("}")

    compiler.jsBuffer = buffer

    // Skip the "@end"
  },
  IvarDeclaration: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    if (node.outlet)
      buffer.concat("@outlet ")
    c(node.ivartype, st, "VariablePattern")
    buffer.concat(" ")
    c(node.id, st, "VariablePattern")
    if (node.accessors)
      buffer.concat(" @accessors")
  },
  MethodDeclarationStatement: function(node, st, c) {
    let compiler = st.compiler,
        saveJSBuffer = compiler.jsBuffer,
        methodScope = new FunctionScope(st),
        isInstanceMethodType = node.methodtype === "-",
        selectors = node.selectors,
        nodeArguments = node.arguments,
        returnType = node.returntype,
        types = [returnType ? returnType.name : (node.action ? "void" : "id")], // Return type is 'id' as default except if it is an action declared method, then it's 'void'
        returnTypeProtocols = returnType ? returnType.protocols : null,
        selector = selectors[0].name // There is always at least one selector

    if (returnTypeProtocols) for (let i = 0, size = returnTypeProtocols.length; i < size; i++) {
      let returnTypeProtocol = returnTypeProtocols[i]
      if (!compiler.getProtocolDef(returnTypeProtocol.name)) {
        compiler.addWarning(createMessage("Cannot find protocol declaration for '" + returnTypeProtocol.name + "'", returnTypeProtocol, compiler.source))
      }
    }

    // If we are generating objective-J code write everything directly to the regular buffer
    // Otherwise we have one for instance methods and one for class methods.
    compiler.jsBuffer = isInstanceMethodType ? compiler.imBuffer : compiler.cmBuffer

    // Put together the selector. Maybe this should be done in the parser...
    // Or maybe we should do it here as when genereting Objective-J code it's kind of handy
    if (nodeArguments.length > 0) {
      for (let i = 0; i < nodeArguments.length; i++) {
        let argument = nodeArguments[i],
            argumentType = argument.type,
            argumentTypeName = argumentType ? argumentType.name : "id",
            argumentProtocols = argumentType ? argumentType.protocols : null

        types.push(argumentTypeName)

        if (i === 0)
          selector += ":"
        else
          selector += (selectors[i] ? selectors[i].name : "") + ":"

        if (argumentProtocols) for (let j = 0; j < argumentProtocols.length; j++) {
          let argumentProtocol = argumentProtocols[j]
          if (!compiler.getProtocolDef(argumentProtocol.name)) {
            compiler.addWarning(createMessage("Cannot find protocol declaration for '" + argumentProtocol.name + "'", argumentProtocol, compiler.source))
          }
        }
      }
    }

    if (compiler.jsBuffer.isEmpty()) // Add comma separator if this is not first method in this buffer
      compiler.jsBuffer.concat(", ")

    compiler.jsBuffer.concat("new objj_method(sel_getUid(\"", node)
    compiler.jsBuffer.concat(selector)
    compiler.jsBuffer.concat("\"), ")

    if (node.body) {
      if (node.returntype && node.returntype.async)
        compiler.jsBuffer.concat("async ")
      compiler.jsBuffer.concat("function")

      if (compiler.options.includeMethodFunctionNames) {
        compiler.jsBuffer.concat(" $" + st.currentClassName() + "__" + selector.replace(/:/g, "_"))
      }

      compiler.jsBuffer.concat("(self, _cmd")

      methodScope.methodType = node.methodtype
      methodScope.vars.self = {type: "method base", scope: methodScope}
      methodScope.vars._cmd = {type: "method base", scope: methodScope}

      if (nodeArguments) for (let i = 0; i < nodeArguments.length; i++) {
        let argument = nodeArguments[i],
            argumentName = argument.identifier.name

        compiler.jsBuffer.concat(", ")
        compiler.jsBuffer.concat(argumentName, argument.identifier)

        methodScope.vars[argumentName] = {type: "method argument", node: argument}
      }

      compiler.jsBuffer.concat(")\n")

      st.compiler.indentation += st.compiler.indentStep
      methodScope.endOfScopeBody = true
      c(node.body, methodScope, "Statement")
      methodScope.variablesNotReadWarnings()
      st.compiler.indentation = st.compiler.indentation.substring(st.compiler.indentationSize)

      compiler.jsBuffer.concat("\n")
    } else { // It is a interface or protocol declatartion and we don't have a method implementation
      compiler.jsBuffer.concat("Nil\n")
    }

    if (compiler.options.includeMethodArgumentTypeSignatures)
      compiler.jsBuffer.concat("," + JSON.stringify(types))
    compiler.jsBuffer.concat(")")
    compiler.jsBuffer = saveJSBuffer

    // Add the method to the class or protocol definition
    let def = st.classDef,
        alreadyDeclared

    // But first, if it is a class definition check if it is declared in superclass or interface declaration
    if (def)
      alreadyDeclared = isInstanceMethodType ? def.getInstanceMethod(selector) : def.getClassMethod(selector)
    else
      def = st.protocolDef

    if (!def)
      throw new Error("InternalError: MethodDeclaration without ClassDeclaration or ProtocolDeclaration at line: " + getLineInfo(compiler.source, node.start).line)

    // Create warnings if types does not corresponds to method declaration in superclass or interface declarations
    // If we don't find the method in superclass or interface declarations above or if it is a protocol
    // declaration, try to find it in any of the conforming protocols
    if (!alreadyDeclared) {
      let protocols = def.protocols

      if (protocols) for (let i = 0; i < protocols.length; i++) {
        let protocol = protocols[i]
        alreadyDeclared = isInstanceMethodType ? protocol.getInstanceMethod(selector) : protocol.getClassMethod(selector)

        if (alreadyDeclared)
          break
      }
    }

    if (alreadyDeclared) {
      let declaredTypes = alreadyDeclared.types

      if (declaredTypes) {
        let typeSize = declaredTypes.length
        if (typeSize > 0) {
          // First type is return type
          let declaredReturnType = declaredTypes[0]

          // Create warning if return types is not the same. It is ok if superclass has 'id' and subclass has a class type
          if (declaredReturnType !== types[0] && !(declaredReturnType === "id" && returnType && returnType.typeisclass))
            compiler.addWarning(createMessage("Conflicting return type in implementation of '" + selector + "': '" + declaredReturnType + "' vs '" + types[0] + "'", returnType || node.action || selectors[0], compiler.source))

          // Check the parameter types. The size of the two type arrays should be the same as they have the same selector.
          for (let i = 1; i < typeSize; i++) {
            let parameterType = declaredTypes[i]

            if (parameterType !== types[i] && !(parameterType === "id" && nodeArguments[i - 1].type.typeisclass))
              compiler.addWarning(createMessage("Conflicting parameter types in implementation of '" + selector + "': '" + parameterType + "' vs '" + types[i] + "'", nodeArguments[i - 1].type || nodeArguments[i - 1].identifier, compiler.source))
          }
        }
      }
    }

    // Now we add it
    let methodDef = new MethodDef(selector, types)

    if (isInstanceMethodType)
      def.addInstanceMethod(methodDef)
    else
      def.addClassMethod(methodDef)
  },
  MessageSendExpression: function(node, st, c) {
    let compiler = st.compiler,
        inlineMsgSend = compiler.options.inlineMsgSendFunctions,
        buffer = compiler.jsBuffer,
        nodeObject = node.object,
        selectors = node.selectors,
        nodeArguments = node.arguments,
        argumentsLength = nodeArguments.length,
        firstSelector = selectors[0],
        selector = firstSelector ? firstSelector.name : "", // There is always at least one selector
        parameters = node.parameters,
        options = compiler.options,
        varScope = st.getVarScope()

    // Put together the selector. Maybe this should be done in the parser...
    for (let i = 0; i < argumentsLength; i++) {
      if (i !== 0) {
        let nextSelector = selectors[i]
        if (nextSelector)
          selector += nextSelector.name
      }
      selector += ":"
    }
    let totalNoOfParameters
    if (!inlineMsgSend) {
      // Find out the total number of arguments so we can choose appropriate msgSend function. Only needed if call the function and not inline it
      totalNoOfParameters = argumentsLength

      if (parameters)
        totalNoOfParameters += parameters.length
    }
    let receiverIsIdentifier
    let receiverIsNotSelf
    let selfLvar
    if (node.superObject) {
      if (inlineMsgSend) {
        buffer.concat("(", node)
        buffer.concat(st.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass)
        buffer.concat(".method_dtable[\"", node)
        buffer.concat(selector)
        buffer.concat("\"] || _objj_forward)(self", node)
      } else {
        buffer.concat("objj_msgSendSuper", node)
        if (totalNoOfParameters < 4) {
          buffer.concat("" + totalNoOfParameters)
        }
        buffer.concat("({ receiver:self, super_class:" + (st.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass) + " }", node)
      }
    } else {
      // If the recevier is not an identifier or an ivar that should have 'self.' infront we need to assign it to a temporary variable
      // If it is 'self' we assume it will never be nil and remove that test
      receiverIsIdentifier = nodeObject.type === "Identifier" && !(st.currentMethodType() === "-" && compiler.getIvarForClass(nodeObject.name, st) && !st.getLvar(nodeObject.name, true))

      if (receiverIsIdentifier) {
        let name = nodeObject.name
        selfLvar = st.getLvar(name)

        if (name === "self") {
          receiverIsNotSelf = !selfLvar || !selfLvar.scope || selfLvar.scope.assignmentToSelf
        } else {
          receiverIsNotSelf = !!selfLvar || !compiler.getClassDef(name)
        }

        if (receiverIsNotSelf) {
          buffer.concat("(", node)
          c(nodeObject, st, "Expression")
          buffer.concat(" == null ? ", node)
          c(nodeObject, st, "Expression")
          buffer.concat(" : ", node)
        }
        if (inlineMsgSend)
          buffer.concat("(", node)
        c(nodeObject, st, "Expression")
      } else {
        receiverIsNotSelf = true
        if (!varScope.receiverLevel) varScope.receiverLevel = 0
        buffer.concat("((___r" + ++varScope.receiverLevel, node)
        buffer.concat(" = ", node)
        c(nodeObject, st, "Expression")
        buffer.concat(")", node)
        buffer.concat(", ___r" + varScope.receiverLevel, node)
        buffer.concat(" == null ? ", node)
        buffer.concat("___r" + varScope.receiverLevel, node)
        buffer.concat(" : ", node)
        if (inlineMsgSend)
          buffer.concat("(", node)
        buffer.concat("___r" + varScope.receiverLevel, node)
        if (!(varScope.maxReceiverLevel >= varScope.receiverLevel))
          varScope.maxReceiverLevel = varScope.receiverLevel
      }
      if (inlineMsgSend) {
        buffer.concat(".isa.method_msgSend[\"", node)
        buffer.concat(selector, node)
        buffer.concat("\"] || _objj_forward)", node)
      } else {
        buffer.concat(".isa.objj_msgSend", node)
      }
    }

    let selectorJSPath

    if (!node.superObject) {
      if (!inlineMsgSend) {
        if (totalNoOfParameters < 4) {
          buffer.concat("" + totalNoOfParameters, node)
        }
      }

      if (receiverIsIdentifier) {
        buffer.concat("(", node)
        c(nodeObject, st, "Expression")
      } else {
        buffer.concat("(___r" + varScope.receiverLevel, node)
      }

      // Only do this if source map is enabled and we have an identifier
      if (options.sourceMap && nodeObject.type === "Identifier") {
        // Get target expression for sourcemap to allow hovering selector to show method function. Create new buffer to write in.
        compiler.jsBuffer = new StringBuffer()
        c(nodeObject, st, "Expression")
        let aTarget = compiler.jsBuffer.toString()
        selectorJSPath = aTarget + ".isa.method_dtable[\"" + selector + "\"]"
        // Restored buffer so everything will continue as usually.
        compiler.jsBuffer = buffer
      }
    }

    buffer.concat(", ", node)
    if (selectorJSPath) {
      buffer.concat("(", node)
      for (let i = 0; i < selectors.length; i++) {
        let nextSelector = selectors[i]
        if (nextSelector) {
          buffer.concat(selectorJSPath, nextSelector)
          buffer.concat(", ", node)
        }
      }
    }
    buffer.concat("\"", node)

    buffer.concat(selector, node) // FIXME: sel_getUid(selector + "") ? This FIXME is from the old preprocessor compiler
    buffer.concat(selectorJSPath ? "\")" : "\"", node)

    if (nodeArguments) for (let i = 0; i < nodeArguments.length; i++) {
      let argument = nodeArguments[i]

      buffer.concat(", ", node)
      c(argument, st, "Expression")
    }

    if (parameters) for (let i = 0; i < parameters.length; ++i) {
      let parameter = parameters[i]

      buffer.concat(", ", node)
      c(parameter, st, "Expression")
    }

    if (!node.superObject) {
      if (receiverIsNotSelf)
        buffer.concat(")", node)
      if (!receiverIsIdentifier)
        varScope.receiverLevel--
    }

    buffer.concat(")", node)
  },
  SelectorLiteralExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    buffer.concat("sel_getUid(\"", node)
    buffer.concat(node.selector)
    buffer.concat("\")")
  },
  ProtocolLiteralExpression: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    buffer.concat("objj_getProtocol(\"", node)
    c(node.id, st, "VariablePattern")
    buffer.concat("\")")
  },
  Reference: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    buffer.concat("function(__input) { if (arguments.length) return ", node)
    c(node.element, st, "Expression")
    buffer.concat(" = __input; return ")
    c(node.element, st, "Expression")
    buffer.concat("; }")
  },
  Dereference: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer

    checkCanDereference(st, node.expr)

    // @deref(y) -> y()
    // @deref(@deref(y)) -> y()()
    c(node.expr, st, "Expression")
    buffer.concat("()")
  },
  ClassStatement: function(node, st, c) {
    let compiler = st.compiler
    let className = node.id.name

    if (compiler.getTypeDef(className))
      throw compiler.error_message(className + " is already declared as a type", node.id)

    if (!compiler.getClassDef(className)) {
      compiler.classDefs[className] = new ClassDef(false, className)
    }
    st.vars[node.id.name] = {type: "class", node: node.id}
  },
  GlobalStatement: function(node, st, c) {
    st.rootScope().vars[node.id.name] = {type: "global", node: node.id}
  },
  PreprocessStatement: ignore,
  TypeDefStatement: function(node, st, c) {
    let compiler = st.compiler,
        buffer = compiler.jsBuffer,
        typeDefName = node.typedefname.name,
        typeDef = compiler.getTypeDef(typeDefName),
        typeDefScope = new Scope(st)

    if (typeDef)
      throw compiler.error_message("Duplicate type definition " + typeDefName, node.typedefname)

    if (compiler.getClassDef(typeDefName))
      throw compiler.error_message(typeDefName + " is already declared as class", node.typedefname)

    buffer.concat("{var the_typedef = objj_allocateTypeDef(\"" + typeDefName + "\");", node)

    typeDef = new TypeDef(typeDefName)
    compiler.typeDefs[typeDefName] = typeDef
    typeDefScope.typeDef = typeDef

    buffer.concat("\nobjj_registerTypeDef(the_typedef);\n")

    buffer.concat("}")

    // Skip to the end
  }
})
