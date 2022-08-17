export let pass2
export let pass1

import walk from "acorn-walk"
import { Scope, FunctionScope } from "./scope";
import { wordsRegexp } from "./util";
import { TypeDef } from "./definition";
import { ClassDef } from "./class-def";
import { StringBuffer } from "./buffer";
import { ProtocolDef } from "./protocol";
import { MethodDef } from "./definition";
import { GlobalVariableMaybeWarning, warningUnknownClassOrGlobal } from "./warning";
import { setupOptions } from "./options";

function isIdempotentExpression(node) {
    switch (node.type) {
        case "Literal":
        case "Identifier":
            return true;

        case "ArrayExpression":
            for (var i = 0; i < node.elements.length; ++i) {
                if (!isIdempotentExpression(node.elements[i]))
                    return false;
            }

            return true;

        case "DictionaryLiteral":
            for (var i = 0; i < node.keys.length; ++i) {
                if (!isIdempotentExpression(node.keys[i]))
                    return false;
                if (!isIdempotentExpression(node.values[i]))
                    return false;
            }

            return true;

        case "ObjectExpression":
            for (var i = 0; i < node.properties.length; ++i)
                if (!isIdempotentExpression(node.properties[i].value))
                    return false;

            return true;

        case "FunctionExpression":
            for (var i = 0; i < node.params.length; ++i)
                if (!isIdempotentExpression(node.params[i]))
                    return false;

            return true;

        case "SequenceExpression":
            for (var i = 0; i < node.expressions.length; ++i)
                if (!isIdempotentExpression(node.expressions[i]))
                    return false;

            return true;

        case "UnaryExpression":
            return isIdempotentExpression(node.argument);

        case "BinaryExpression":
            return isIdempotentExpression(node.left) && isIdempotentExpression(node.right);

        case "ConditionalExpression":
            return isIdempotentExpression(node.test) && isIdempotentExpression(node.consequent) && isIdempotentExpression(node.alternate);

        case "MemberExpression":
            return isIdempotentExpression(node.object) && (!node.computed || isIdempotentExpression(node.property));

        case "Dereference":
            return isIdempotentExpression(node.expr);

        case "Reference":
            return isIdempotentExpression(node.element);

        default:
            return false;
    }
}

// We do not allow dereferencing of expressions with side effects because we might need to evaluate the expression twice in certain uses of deref, which is not obvious when you look at the deref operator in plain code.
function checkCanDereference(st, node) {
    if (!isIdempotentExpression(node))
        throw st.compiler.error_message("Dereference of expression with side effects", node);
}

// Surround expression with parentheses
function surroundExpression(c) {
    return function (node, st, override) {
        st.compiler.jsBuffer.concat("(");
        c(node, st, override);
        st.compiler.jsBuffer.concat(")");
    }
}

var operatorPrecedence = {
    // MemberExpression
    // These two are never used as they are a MemberExpression with the attribute 'computed' which tells what operator it uses.
    //".": 0, "[]": 0,
    // NewExpression
    // This is never used.
    //"new": 1,
    // All these are UnaryExpression or UpdateExpression and never used.
    //"!": 2, "~": 2, "-": 2, "+": 2, "++": 2, "--": 2, "typeof": 2, "void": 2, "delete": 2,
    // BinaryExpression
    "*": 3, "/": 3, "%": 3,
    "+": 4, "-": 4,
    "<<": 5, ">>": 5, ">>>": 5,
    "<": 6, "<=": 6, ">": 6, ">=": 6, "in": 6, "instanceof": 6,
    "==": 7, "!=": 7, "===": 7, "!==": 7,
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

var expressionTypePrecedence = {
    MemberExpression: 1, CallExpression: 1,
    NewExpression: 2,
    FunctionExpression: 3, ArrowFunctionExpression: 3, ImportExpression: 3,
    UnaryExpression: 4, UpdateExpression: 4,
    BinaryExpression: 5,
    LogicalExpression: 6,
    ConditionalExpression: 7,
    AssignmentExpression: 8
}

function ignore(_node, _st, _c) {}

pass1 = walk.make({
    ImportStatement: function (node, st, c) {
        var urlString = node.filename.value;

        st.compiler.dependencies.push({ url: urlString, isLocal: node.localfilepath });
        //st.compiler.dependencies.push(typeof FileDependency !== 'undefined' ? new FileDependency(typeof CFURL !== 'undefined' ? new CFURL(urlString) : urlString, node.localfilepath) : urlString);
    },
    TypeDefStatement: ignore,
    ClassStatement: ignore,
    ClassDeclarationStatement: ignore,
    MessageSendExpression: ignore,
    GlobalStatement: ignore,
    ProtocolDeclarationStatement: ignore
});

// Returns true if subNode has higher precedence the the root node.
// If the subNode is the right (as in left/right) subNode
function nodePrecedence(node, subNode, right) {
    var nodeType = node.type,
        nodePrecedence = expressionTypePrecedence[nodeType] || -1,
        subNodePrecedence = expressionTypePrecedence[subNode.type] || -1,
        nodeOperatorPrecedence,
        subNodeOperatorPrecedence;
    return nodePrecedence < subNodePrecedence || (nodePrecedence === subNodePrecedence && isLogicalBinary.test(nodeType) && ((nodeOperatorPrecedence = operatorPrecedence[node.operator]) < (subNodeOperatorPrecedence = operatorPrecedence[subNode.operator]) || (right && nodeOperatorPrecedence === subNodeOperatorPrecedence)));
}

var indentType = " ";
var indentationSpaces = 4;
var indentationSize = indentationSpaces * indentType.length;
var indentStep = Array(indentationSpaces + 1).join(indentType);
global.indentation = "";

var reservedIdentifiers = wordsRegexp("self _cmd __filename undefined localStorage arguments");
var wordPrefixOperators = wordsRegexp("delete in instanceof new typeof void");
var isLogicalBinary = wordsRegexp("LogicalExpression BinaryExpression");

pass2 = walk.make({
    Program: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate;

        indentType = compiler.options.indentationType;
        indentationSpaces = compiler.options.indentationSpaces;
        indentationSize = indentationSpaces * indentType.length;
        indentStep = Array(indentationSpaces + 1).join(indentType);
        indentation = "";

        for (var i = 0; i < node.body.length; ++i) {
            c(node.body[i], st, "Statement");
        }
        if (!generate) compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.end));

        // Check maybe warnings
        var maybeWarnings = st.maybeWarnings();
        if (maybeWarnings) for (var i = 0; i < maybeWarnings.length; i++) {
            var maybeWarning = maybeWarnings[i];
            if (maybeWarning.checkIfWarning(st)) {
                compiler.addWarning(maybeWarning.message);
            }
        }
    },
    BlockStatement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            endOfScopeBody = st.endOfScopeBody,
            buffer;

        if (endOfScopeBody)
            delete st.endOfScopeBody;

        if (generate) {
            var skipIndentation = st.skipIndentation;
            buffer = compiler.jsBuffer;
            if (skipIndentation)
                delete st.skipIndentation;
            else
                buffer.concat(indentation.substring(indentationSize));
            buffer.concat("{\n", node);
        }
        for (var i = 0; i < node.body.length; ++i) {
            c(node.body[i], st, "Statement");
        }
        if (generate) {
            var maxReceiverLevel = st.maxReceiverLevel;
            if (endOfScopeBody && maxReceiverLevel) {
                buffer.concat(indentation);
                buffer.concat("var ");
                for (var i = 0; i < maxReceiverLevel; i++) {
                    if (i) buffer.concat(", ");
                    buffer.concat("___r");
                    buffer.concat((i + 1) + "");
                }
                buffer.concat(";\n");
            }

            //Simulate a node for the last curly bracket
            //      var endNode = node.loc && { loc: { start: { line : node.loc.end.line, column: node.loc.end.column}}, source: node.loc.source};

            buffer.concat(indentation.substring(indentationSize));
            buffer.concat("}", node);
            if (st.isDefaultExport) buffer.concat(";")
            if (!skipIndentation && st.isDecl !== false)
                buffer.concat("\n");
            st.indentBlockLevel--;
        }
    },
    ExpressionStatement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate;
        if (generate) compiler.jsBuffer.concat(indentation);
        let isDirective = node.directive
        if (node.expression.type === "Reference") throw compiler.error_message("Can't have reference of expression as a statement", node.expression)
        //if (!isDirective) compiler.jsBuffer.concat("(");  // TODO: This will probably throw parentheses everywhere.
        c(node.expression, st, "Expression");
        //if (!isDirective) compiler.jsBuffer.concat(")");
        if (generate) compiler.jsBuffer.concat(";\n", node);
    },
    IfStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("if", node);
                buffer.concatFormat(format.beforeLeftParenthesis);
                buffer.concat("(");
            } else {
                // Keep the 'else' and 'if' on the same line if it is an 'else if'
                if (!st.superNodeIsElse)
                    buffer.concat(indentation);
                else
                    delete st.superNodeIsElse;
                buffer.concat("if (", node);
            }
        }
        c(node.test, st, "Expression");
        if (generate) {
            if (format) {
                buffer.concat(")", node);
                buffer.concatFormat(format.afterRightParenthesis);
            } else {
                // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
                buffer.concat(node.consequent.type === "EmptyStatement" ? ");\n" : ")\n", node);
            }
        }
        indentation += indentStep;
        c(node.consequent, st, "Statement");
        indentation = indentation.substring(indentationSize);
        var alternate = node.alternate;
        if (alternate) {
            var alternateNotIf = alternate.type !== "IfStatement";
            if (generate) {
                if (format) {
                    buffer.concatFormat(format.beforeElse); // Do we need this?
                    buffer.concat("else", node);
                    buffer.concatFormat(format.afterElse);
                } else {
                    var emptyStatement = alternate.type === "EmptyStatement";
                    buffer.concat(indentation);
                    // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
                    buffer.concat(alternateNotIf ? emptyStatement ? "else;\n" : "else\n" : "else ", node);
                }
            }
            if (alternateNotIf)
                indentation += indentStep;
            else
                st.superNodeIsElse = true;

            c(alternate, st, "Statement");
            if (alternateNotIf) indentation = indentation.substring(indentationSize);
        }
    },
    LabeledStatement: function (node, st, c, format) {
        var compiler = st.compiler;
        if (compiler.generate) {
            var buffer = compiler.jsBuffer;
            if (!format) buffer.concat(indentation);
            c(node.label, st, "VariablePattern");
            if (format) {
                buffer.concat(":", node);
                buffer.concatFormat(format.afterColon);
            } else {
                buffer.concat(": ", node);
            }
        }
        c(node.body, st, "Statement");
    },
    BreakStatement: function (node, st, c, format) {
        var compiler = st.compiler;
        if (compiler.generate) {
            var label = node.label,
                buffer = compiler.jsBuffer;
            if (!format) buffer.concat(indentation);
            if (label) {
                if (format) {
                    buffer.concat("break", node);
                    buffer.concatFormat(format.beforeLabel);
                } else {
                    buffer.concat("break ", node);
                }
                c(label, st, "VariablePattern");
                if (!format) buffer.concat(";\n");
            } else
                buffer.concat(format ? "break" : "break;\n", node);
        }
    },
    ContinueStatement: function (node, st, c, format) {
        var compiler = st.compiler;
        if (compiler.generate) {
            var label = node.label,
                buffer = compiler.jsBuffer;
            if (!format) buffer.concat(indentation);
            if (label) {
                if (format) {
                    buffer.concat("continue", node);
                    buffer.concatFormat(format.beforeLabel);
                } else {
                    buffer.concat("continue ", node);
                }
                c(label, st, "VariablePattern");
                if (!format) buffer.concat(";\n");
            } else
                buffer.concat(format ? "continue" : "continue;\n", node);
        }
    },
    WithStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("with", node);
                buffer.concatFormat(format.beforeLeftParenthesis);
                buffer.concat("(");
            } else {
                buffer.concat(indentation);
                buffer.concat("with(", node);
            }
        }
        c(node.object, st, "Expression");
        if (generate)
            if (format) {
                buffer.concat(")", node);
                buffer.concatFormat(format.afterRightParenthesis);
            } else {
                buffer.concat(")\n", node);
            }
        indentation += indentStep;
        c(node.body, st, "Statement");
        indentation = indentation.substring(indentationSize);
    },
    SwitchStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("switch", node);
                buffer.concatFormat(format.beforeLeftParenthesis);
                buffer.concat("(", node);
            } else {
                buffer.concat(indentation);
                buffer.concat("switch(", node);
            }
        }
        c(node.discriminant, st, "Expression");
        if (generate)
            if (format) {
                buffer.concat(")");
                buffer.concatFormat(format.afterRightParenthesis);
                buffer.concat("{");
                buffer.concatFormat(format.afterLeftBrace);
            } else {
                buffer.concat(") {\n");
            }
        indentation += indentStep;
        for (var i = 0; i < node.cases.length; ++i) {
            var cs = node.cases[i];
            if (cs.test) {
                if (generate) {
                    if (format) {
                        buffer.concatFormat(format.beforeCase);
                        buffer.concat("case", node);
                        buffer.concatFormat(format.afterCase);
                    } else {
                        buffer.concat(indentation);
                        buffer.concat("case ");
                    }
                }
                c(cs.test, st, "Expression");
                if (generate)
                    if (format) {
                        buffer.concat(":");
                        buffer.concatFormat(format.afterColon);
                    } else {
                        buffer.concat(":\n");
                    }
            } else
                if (generate)
                    if (format) {
                        buffer.concatFormat(format.beforeCase);
                        buffer.concat("default");
                        buffer.concatFormat(format.afterCase);
                        buffer.concat(":");
                        buffer.concatFormat(format.afterColon);
                    } else {
                        buffer.concat("default:\n");
                    }
            indentation += indentStep;
            for (var j = 0; j < cs.consequent.length; ++j)
                c(cs.consequent[j], st, "Statement");
            indentation = indentation.substring(indentationSize);
        }
        indentation = indentation.substring(indentationSize);
        if (generate) {
            if (format) {
                buffer.concatFormat(format.beforeRightBrace);
                buffer.concat("}");
            } else {
                buffer.concat(indentation);
                buffer.concat("}\n");
            }
        }
    },
    ReturnStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (!format) buffer.concat(indentation);
            buffer.concat("return", node);
        }
        if (node.argument) {
            if (generate) buffer.concatFormat(format ? format.beforeExpression : " ");
            c(node.argument, st, "Expression");
        }
        if (generate && !format) buffer.concat(";\n");
    },
    ThrowStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (!format) buffer.concat(indentation);
            buffer.concat("throw", node);
            buffer.concatFormat(format ? format.beforeExpression : " ");
        }
        c(node.argument, st, "Expression");
        if (generate && !format) buffer.concat(";\n");
    },
    TryStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (!format) buffer.concat(indentation);
            buffer.concat("try", node);
            buffer.concatFormat(format ? format.beforeStatement : " ");
        }
        indentation += indentStep;
        if (!format) st.skipIndentation = true;
        c(node.block, st, "Statement");
        indentation = indentation.substring(indentationSize);
        if (node.handler) {
            var handler = node.handler,
                inner = new Scope(st),
                param = handler.param,
                name = param?.name;
            if (name) inner.vars[name] = { type: "catch clause", node: param };
            if (generate) {
                if (format) {
                    buffer.concatFormat(format.beforeCatch);
                    buffer.concat("catch");
                    buffer.concatFormat(format.afterCatch);
                    if (param) {
                        buffer.concat("(");
                        c(param, st, "Pattern");
                        buffer.concat(")");
                    }
                    buffer.concatFormat(format.beforeCatchStatement);
                } else {
                    buffer.concat("\n");
                    buffer.concat(indentation);
                    buffer.concat("catch");
                    if (param) {
                        buffer.concat("(")
                        c(param, st, "Pattern");
                        buffer.concat(") ");
                    }
                }
            }
            indentation += indentStep;
            inner.skipIndentation = true;
            inner.endOfScopeBody = true;
            c(handler.body, inner, "BlockStatement");
            inner.variablesNotReadWarnings();
            indentation = indentation.substring(indentationSize);
            inner.copyAddedSelfToIvarsToParent();
        }
        if (node.finalizer) {
            if (generate) {
                if (format) {
                    buffer.concatFormat(format.beforeCatch);
                    buffer.concat("finally");
                    buffer.concatFormat(format.beforeCatchStatement);
                } else {
                    buffer.concat("\n");
                    buffer.concat(indentation);
                    buffer.concat("finally ");
                }
            }
            indentation += indentStep;
            st.skipIndentation = true;
            c(node.finalizer, st, "Statement");
            indentation = indentation.substring(indentationSize);
        }
        if (generate && !format)
            buffer.concat("\n");
    },
    WhileStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            body = node.body,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("while", node);
                buffer.concatFormat(format.beforeLeftParenthesis);
                buffer.concat("(");
            } else {
                buffer.concat(indentation);
                buffer.concat("while (", node);
            }
        }
        c(node.test, st, "Expression");
        if (generate)
            if (format) {
                buffer.concat(")");
                buffer.concatFormat(format.afterRightParenthesis);
            } else {
                // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
                buffer.concat(body.type === "EmptyStatement" ? ")\n" : ")\n");
            }
        indentation += indentStep;
        c(body, st, "Statement");
        indentation = indentation.substring(indentationSize);
    },
    DoWhileStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("do", node);
                buffer.concatFormat(format.beforeStatement);
            } else {
                buffer.concat(indentation);
                buffer.concat("do\n", node);
            }
        }
        indentation += indentStep;
        c(node.body, st, "Statement");
        indentation = indentation.substring(indentationSize);
        if (generate) {
            if (format) {
                buffer.concat("while");
                buffer.concatFormat(format.beforeLeftParenthesis);
                buffer.concat("(");
            } else {
                buffer.concat(indentation);
                buffer.concat("while (");
            }
        }
        c(node.test, st, "Expression");
        if (generate) buffer.concatFormat(format ? ")" : ");\n");
    },
    ForStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            body = node.body,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("for", node);
                buffer.concatFormat(format.beforeLeftParenthesis);
                buffer.concat("(");
            } else {
                buffer.concat(indentation);
                buffer.concat("for (", node);
            }
        }
        if (node.init) c(node.init, st, "ForInit");
        if (generate) buffer.concat(format ? ";" : "; ");
        if (node.test) c(node.test, st, "Expression");
        if (generate) buffer.concat(format ? ";" : "; ");
        if (node.update) c(node.update, st, "Expression");
        if (generate)
            if (format) {
                buffer.concat(")");
                buffer.concatFormat(format.afterRightParenthesis);
            } else {
                // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
                buffer.concat(body.type === "EmptyStatement" ? ")\n" : ")\n");
            }
        indentation += indentStep;
        c(body, st, "Statement");
        indentation = indentation.substring(indentationSize);
    },
    ForInStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            body = node.body,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("for", node);
                buffer.concatFormat(format.beforeLeftParenthesis);
                buffer.concat("(");
            } else {
                buffer.concat(indentation);
                buffer.concat("for (", node);
            }
        }
        c(node.left, st, "ForInit");
        if (generate)
            if (format) {
                buffer.concatFormat(format.beforeIn);
                buffer.concat("in");
                buffer.concatFormat(format.afterIn);
            } else {
                buffer.concat(" in ");
            }
        c(node.right, st, "Expression");
        if (generate)
            if (format) {
                buffer.concat(")");
                buffer.concatFormat(format.afterRightParenthesis);
            } else {
                // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
                buffer.concat(body.type === "EmptyStatement" ? ")\n" : ")\n");
            }
        indentation += indentStep;
        c(body, st, "Statement");
        indentation = indentation.substring(indentationSize);
    },
    ForOfStatement: function (node, st, c, format) {  // TODO: Fix code duplication with 'for in'-
        var compiler = st.compiler,
            generate = compiler.generate,
            body = node.body,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("for", node);
                buffer.concatFormat(format.beforeLeftParenthesis);
                buffer.concat("(");
            } else {
                buffer.concat("for", node);
                if (node.await) buffer.concat(" await ");
                buffer.concat("(");
            }
        }
        c(node.left, st, "ForInit");
        if (generate)
            if (format) {
                buffer.concatFormat(format.beforeIn); // TODO: Should we have different format options for 'of'?
                buffer.concat("of");
                buffer.concatFormat(format.afterIn);
            } else {
                buffer.concat(" of ");
            }
        c(node.right, st, "Expression");
        if (generate)
            if (format) {
                buffer.concat(")");
                buffer.concatFormat(format.afterRightParenthesis);
            } else {
                // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
                buffer.concat(body.type === "EmptyStatement" ? ")\n" : ")\n");
            }
        indentation += indentStep;
        c(body, st, "Statement");
        indentation = indentation.substring(indentationSize);
    },
    ForInit: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer;
        if (node.type === "VariableDeclaration") {
            st.isFor = true;
            c(node, st);
            delete st.isFor;
        } else if (node.type == "BinaryExpression" && node.operator == "in") {
            buffer.concat("(")
            c(node, st, "Expression");
            buffer.concat(")")
        } else {
            c(node, st, "Expression");
        }
    },
    DebuggerStatement: function (node, st, c, format) {
        var compiler = st.compiler;
        if (compiler.generate) {
            var buffer = compiler.jsBuffer;
            if (format) {
                buffer.concat("debugger", node);
            } else {
                buffer.concat(indentation);
                buffer.concat("debugger;\n", node);
            }
        }
    },
    Function: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer,
            inner = new FunctionScope(st),
            decl = node.type == "FunctionDeclaration",
            id = node.id;

        inner.isDecl = decl;
        for (var i = 0; i < node.params.length; ++i)
            inner.vars[node.params[i].name] = { type: "argument", node: node.params[i] };
        if (generate && !format)
            buffer.concat(indentation);
        if (id) {
            var name = id.name;
            (decl ? st : inner).vars[name] = { type: decl ? "function" : "function name", node: id };
            if (compiler.transformNamedFunctionDeclarationToAssignment) {
                if (generate) {
                    buffer.concat(name);
                    buffer.concat(" = ");
                } else {
                    buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
                    buffer.concat(name);
                    buffer.concat(" = ");
                    if (node.async) buffer.concat("async ");
                    if (!st.skipFunctionKeyword) buffer.concat("function");
                    compiler.lastPos = id.end;
                }
            }
        }
        if (generate) {
            if ((st.isDefaultExport || !node.id) && !decl && !st.isComputed) buffer.concat("(")
            if (node.async) buffer.concat("async ");
            if (!st.skipFunctionKeyword) buffer.concat("function", node);
            if (node.generator) buffer.concat("*")
            if (!compiler.transformNamedFunctionDeclarationToAssignment && id) {
                if (!format) buffer.concat(" ");
                if (st.isComputed) buffer.concat("[")
                c(id, st);
                if (st.isComputed) buffer.concat("]")
            }
            if (format) buffer.concatFormat(format.beforeLeftParenthesis);
            buffer.concat("(");
            for (var i = 0; i < node.params.length; ++i) {
                if (i)
                    buffer.concat(format ? "," : ", ");
                if (node.params[i].type == "RestElement") {
                    c(node.params[i], st, "RestElement");
                } else {
                    c(node.params[i], st, "Pattern");
                }
            }
            if (format) {
                buffer.concat(")");
                buffer.concatFormat(format.afterRightParenthesis);
            } else {
                buffer.concat(")\n");
            }
        }
        indentation += indentStep;
        inner.endOfScopeBody = true;
        c(node.body, inner, "Statement");
        if ((st.isDefaultExport || !node.id) && !decl && !st.isComputed) buffer.concat(")")
        inner.variablesNotReadWarnings();
        indentation = indentation.substring(indentationSize);
        inner.copyAddedSelfToIvarsToParent();
    },
    ObjectPattern: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate;
        if (generate) {
            c(node, st, "ObjectExpression")
        }
    },
    RestElement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
            buffer.concat("...")
            c(node.argument, st)
        }
    },
    EmptyStatement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
            buffer.concat(";")
        }
    },
    VariableDeclaration: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            isVar = node.kind === "var",
            varScope = isVar ? st.getVarScope() : st,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            if (!st.isFor && !format) buffer.concat(indentation);
            buffer.concat(format ? node.kind : node.kind + " ", node);
        }
        for (var i = 0; i < node.declarations.length; ++i) {
            var decl = node.declarations[i],
                identifier = decl.id.name,
                possibleHoistedVariable = isVar && varScope.possibleHoistedVariables && varScope.possibleHoistedVariables[identifier],
                variableDeclaration = { type: node.kind, node: decl.id, isRead: (possibleHoistedVariable ? possibleHoistedVariable.isRead : 0) };

            // Make sure we count the access for this varaible if it is hoisted.
            // Check if this variable has already been accessed above this declaration
            if (possibleHoistedVariable) {
                // 'variableDeclaration' is already marked as read. This was done by adding the already read amount above.

                // Substract the same amount from possible local variable higher up in the hierarchy that is shadowed by this declaration
                if (possibleHoistedVariable.variable) {
                    possibleHoistedVariable.variable.isRead -= possibleHoistedVariable.isRead;
                }
                // Remove it as we don't need to care about this variable anymore.
                varScope.possibleHoistedVariables[identifier] = null;
            }
            varScope.vars[identifier] = variableDeclaration;

            if (i)
                if (generate) {
                    if (format) {
                        buffer.concat(",");
                    } else {
                        if (st.isFor)
                            buffer.concat(", ");
                        else {
                            buffer.concat(",\n");
                            buffer.concat(indentation);
                            buffer.concat("    ");
                        }
                    }
                }

            c(decl.id, st, "Pattern");
            if (decl.init) {
                if (generate) {
                    if (format) {
                        buffer.concatFormat(format.beforeEqual);
                        buffer.concat("=");
                        buffer.concatFormat(format.afterEqual);
                    } else {
                        buffer.concat(" = ");
                    }
                }
                c(decl.init, st, "Expression");
            }
            // FIXME: Extract to function
            // Here we check back if a ivar with the same name exists and if we have prefixed 'self.' on previous uses.
            // If this is the case we have to remove the prefixes and issue a warning that the variable hides the ivar.
            if (st.addedSelfToIvars) {
                var addedSelfToIvar = st.addedSelfToIvars[identifier];
                if (addedSelfToIvar) {
                    var jsBuffer = st.compiler.jsBuffer;
                    for (var i = 0, size = addedSelfToIvar.length; i < size; i++) {
                        var dict = addedSelfToIvar[i];
                        jsBuffer.removeAtIndex(dict.index);
                        if (compiler.options.warnings.includes(warningShadowIvar)) compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", dict.node, compiler.source));
                    }
                    // Add a read mark to the local variable for each time it is used.
                    variableDeclaration.isRead += size;
                    // Remove the variable from list of instance variable uses.
                    st.addedSelfToIvars[identifier] = [];
                }
            }
        }
        if (generate && !format && !st.isFor) buffer.concat(";\n", node); // Don't add ';' if this is a for statement but do it if this is a statement
    },
    ThisExpression: function (node, st, c) {
        var compiler = st.compiler;

        if (compiler.generate) compiler.jsBuffer.concat("this", node);
    },
    ArrayExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;

        if (generate) {
            buffer = compiler.jsBuffer;
            buffer.concat("[", node);
        }

        for (var i = 0; i < node.elements.length; ++i) {
            var elt = node.elements[i];

            if (generate && i !== 0)
                if (format) {
                    buffer.concatFormat(format.beforeComma);
                    buffer.concat(",");
                    buffer.concatFormat(format.afterComma);
                } else
                    buffer.concat(", ");

            if (elt) c(elt, st, "Expression");
        }
        if (generate) buffer.concat("]");
    },
    ObjectExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            properties = node.properties,
            buffer = compiler.jsBuffer;
        if (generate) buffer.concat("{", node);
        let isFirst = true
        for (const prop of properties) {
            if (!isFirst) {
                if (format) {
                    buffer.concatFormat(format.beforeComma);
                    buffer.concat(",");
                    buffer.concatFormat(format.afterComma);
                } else {
                    buffer.concat(", ");
                }
            } else {
                isFirst = false
            }
            if (prop.value?.type == "AssignmentPattern" && prop.shorthand) {
                c(prop, st)
            } else if (prop.type == "Property") {
                if (prop.kind === "get" || prop.kind === "set" || prop.method) {
                    let s = prop.method ? "" : prop.kind
                    buffer.concat(s + " ")
                    prop.value.id = prop.key
                    st.isComputed = prop.computed
                    st.skipFunctionKeyword = true
                    c(prop.value, st)
                    delete st.writeFunction
                    delete st.isComputed

                } else {
                    if (generate) {
                        if (prop.computed) buffer.concat("[")
                        st.isPropertyKey = true;
                        c(prop.key, st, "Expression");
                        delete st.isPropertyKey;
                        if (prop.computed) buffer.concat("]")
                        if (!prop.shorthand) {
                            if (format) {
                                buffer.concatFormat(format.beforeColon);
                                buffer.concat(":");
                                buffer.concatFormat(format.afterColon);
                            } else {
                                buffer.concat(": ");
                            }
                        }
                    } else if (prop.key.raw && prop.key.raw.charAt(0) === "@") {
                        buffer.concat(compiler.source.substring(compiler.lastPos, prop.key.start));
                        compiler.lastPos = prop.key.start + 1;
                    }
                    if (!prop.shorthand) c(prop.value, st, "Pattern");
                }
            } else {
                c(prop, st)
            }
        }
        if (generate) buffer.concat("}");
    },
    StaticBlock: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
            buffer.concat(indentation)
            buffer.concat("static")
            buffer.concat("{")
            for (var i = 0; i < node.body.length; ++i) {
                c(node.body[i], st, "Statement");
            }
            buffer.concat("}")
        }
    },
    SpreadElement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
            buffer.concat("...")
            c(node.argument, st)
        }
    },
    SequenceExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            buffer.concat("(", node);
        }
        for (var i = 0; i < node.expressions.length; ++i) {
            if (generate && i !== 0)
                if (format) {
                    buffer.concatFormat(format.beforeComma);
                    buffer.concat(",");
                    buffer.concatFormat(format.afterComma);
                } else
                    buffer.concat(", ");
            c(node.expressions[i], st, "Expression");
        }
        if (generate) buffer.concat(")");
    },
    UnaryExpression: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            argument = node.argument;
        if (generate) {
            var buffer = compiler.jsBuffer;
            if (node.prefix) {
                buffer.concat(node.operator, node);
                if (wordPrefixOperators.test(node.operator))
                    buffer.concat(" ");
                (nodePrecedence(node, argument) ? surroundExpression(c) : c)(argument, st, "Expression");
            } else {
                (nodePrecedence(node, argument) ? surroundExpression(c) : c)(argument, st, "Expression");
                buffer.concat(node.operator);
            }
        } else {
            c(argument, st, "Expression");
        }
    },
    UpdateExpression: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (node.argument.type === "Dereference") {
            checkCanDereference(st, node.argument);

            // @deref(x)++ and ++@deref(x) require special handling.
            if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

            // Output the dereference function, "(...)(z)"
            buffer.concat((node.prefix ? "" : "(") + "(");

            // The thing being dereferenced.
            if (!generate) compiler.lastPos = node.argument.expr.start;
            c(node.argument.expr, st, "Expression");
            if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.argument.expr.end));
            buffer.concat(")(");

            if (!generate) compiler.lastPos = node.argument.start;
            c(node.argument, st, "Expression");
            if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.argument.end));
            buffer.concat(" " + node.operator.substring(0, 1) + " 1)" + (node.prefix ? "" : node.operator == '++' ? " - 1)" : " + 1)"));

            if (!generate) compiler.lastPos = node.end;
            return;
        }

        if (node.prefix) {
            if (generate) {
                buffer.concat(node.operator, node);
                if (wordPrefixOperators.test(node.operator))
                    buffer.concat(" ");
            }
            (generate && nodePrecedence(node, node.argument) ? surroundExpression(c) : c)(node.argument, st, "Expression");
        } else {
            (generate && nodePrecedence(node, node.argument) ? surroundExpression(c) : c)(node.argument, st, "Expression");
            if (generate) buffer.concat(node.operator);
        }
    },
    BinaryExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate;
        if (node.operator == "**" || node.left.type == "ArrowFunctionExpression") {
            surroundExpression(c)(node.left, st, "Expression");
        } else {
            (generate && nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, "Expression");
        }
        if (generate) {
            var buffer = compiler.jsBuffer;
            buffer.concatFormat(format ? format.beforeOperator : " ");
            buffer.concat(node.operator, node);
            buffer.concatFormat(format ? format.afterOperator : " ");
        }
        (generate && nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression");
    },
    LogicalExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate;
        if (node.operator == "??") {
            surroundExpression(c)(node.left, st, "Expression");
        } else {
            (generate && nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, "Expression");
        }
        if (generate) {
            var buffer = compiler.jsBuffer;
            buffer.concatFormat(format ? format.beforeOperator : " ");
            buffer.concat(node.operator);
            buffer.concatFormat(format ? format.afterOperator : " ");
        }
        if (node.operator == "??") {
            surroundExpression(c)(node.right, st, "Expression");
        } else {
            (generate && nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression");
        }
    },
    AssignmentExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            saveAssignment = st.assignment,
            buffer = compiler.jsBuffer;

        if (node.left.type === "Dereference") {
            checkCanDereference(st, node.left);

            // @deref(x) = z    -> x(z) etc
            if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

            // Output the dereference function, "(...)(z)"
            buffer.concat("(", node);
            // What's being dereferenced could itself be an expression, such as when dereferencing a deref.
            if (!generate) compiler.lastPos = node.left.expr.start;
            c(node.left.expr, st, "Expression");
            if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.left.expr.end));
            buffer.concat(")(");

            // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
            if (node.operator !== "=") {
                // Output the whole .left, not just .left.expr.
                if (!generate) compiler.lastPos = node.left.start;
                c(node.left, st, "Expression");
                if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.left.end));
                buffer.concat(" " + node.operator.substring(0, 1) + " ");
            }

            if (!generate) compiler.lastPos = node.right.start;
            c(node.right, st, "Expression");
            if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.right.end));
            buffer.concat(")");

            if (!generate) compiler.lastPos = node.end;

            return;
        }

        var saveAssignment = st.assignment,
            nodeLeft = node.left;

        st.assignment = true;
        if (nodeLeft.type === "Identifier" && nodeLeft.name === "self") {
            var lVar = st.getLvar("self", true);
            if (lVar) {
                var lvarScope = lVar.scope;
                if (lvarScope)
                    lvarScope.assignmentToSelf = true;
            }
        }
        (generate && nodePrecedence(node, nodeLeft) ? surroundExpression(c) : c)(nodeLeft, st, "Expression");
        if (generate) {
            buffer.concatFormat(format ? format.beforeOperator : " ");
            buffer.concat(node.operator);
            buffer.concatFormat(format ? format.afterOperator : " ");
        }
        st.assignment = saveAssignment;
        (generate && nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression");
        if (st.isRootScope() && nodeLeft.type === "Identifier" && !st.getLvar(nodeLeft.name))
            st.vars[nodeLeft.name] = { type: "global", node: nodeLeft };
    },
    AssignmentPattern: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer;
        c(node.left, st, "Pattern")
        buffer.concat(" = ");
        c(node.right, st, "Expression")
    },
    ArrayPattern: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer;
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
    TemplateLiteral: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer;

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
    ConditionalExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        (generate && nodePrecedence(node, node.test) ? surroundExpression(c) : c)(node.test, st, "Expression");
        if (generate) {
            buffer = compiler.jsBuffer;
            if (format) {
                buffer.concatFormat(format.beforeOperator);
                buffer.concat("?");
                buffer.concatFormat(format.afterOperator);
            } else {
                buffer.concat(" ? ");
            }
        }
        c(node.consequent, st, "Expression");
        if (generate)
            if (format) {
                buffer.concatFormat(format.beforeOperator);
                buffer.concat(":");
                buffer.concatFormat(format.afterOperator);
            } else {
                buffer.concat(" : ");
            }
        c(node.alternate, st, "Expression");
    },
    NewExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            nodeArguments = node.arguments,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            buffer.concat("new ", node);
        }
        (generate && nodePrecedence(node, node.callee) ? surroundExpression(c) : c)(node.callee, st, "Expression");
        if (generate) buffer.concat("(");
        if (nodeArguments) {
            for (var i = 0, size = nodeArguments.length; i < size; ++i) {
                if (i && generate)
                    buffer.concatFormat(format ? "," : ", ");
                c(nodeArguments[i], st, "Expression");
            }
        }
        if (generate) buffer.concat(")");
    },
    CallExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            nodeArguments = node.arguments,
            generate = compiler.generate,
            callee = node.callee,
            buffer;

        // If call to function 'eval' we assume that 'self' can be altered and from this point
        // we check if 'self' is null before 'objj_msgSend' is called with 'self' as receiver.
        if (callee.type === "Identifier" && callee.name === "eval") {
            var selfLvar = st.getLvar("self", true);
            if (selfLvar) {
                var selfScope = selfLvar.scope;
                if (selfScope) {
                    selfScope.assignmentToSelf = true;
                }
            }
        }

        (generate && nodePrecedence(node, callee) ? surroundExpression(c) : c)(callee, st, "Expression");
        if (generate) {
            buffer = compiler.jsBuffer;
            if (node.optional) buffer.concat("?.")
            buffer.concat("(");
        }
        if (nodeArguments) {
            for (var i = 0, size = nodeArguments.length; i < size; ++i) {
                if (i && generate)
                    buffer.concat(format ? "," : ", ");
                c(nodeArguments[i], st, "Expression");
            }
        }
        if (generate) buffer.concat(")");
    },
    MemberExpression: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            computed = node.computed;
        (generate && nodePrecedence(node, node.object) ? surroundExpression(c) : c)(node.object, st, "Expression");
        if (generate) {
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
            compiler.jsBuffer.concat(s);
        }
        st.secondMemberExpression = !computed;
        // No parentheses when it is computed, '[' and ']' are the same thing.
        (generate && !computed && nodePrecedence(node, node.property) ? surroundExpression(c) : c)(node.property, st, "Expression");
        st.secondMemberExpression = false;
        if (generate && computed)
            compiler.jsBuffer.concat("]");
    },
    ChainExpression: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;

        if (generate) {
            buffer.concat("(")
            c(node.expression, st)
            buffer.concat(")")
        }
    },
    AwaitExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            buffer.concat("await", node);
        }
        if (node.argument) {
            if (generate) buffer.concatFormat(format ? format.beforeExpression : " ");
            buffer.concat("(")
            c(node.argument, st, "Expression");
            buffer.concat(")")
        }
    },
    ArrowFunctionExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
            if (node.async) buffer.concat("async ")
            buffer.concat("(")
            let isFirst = true
            for (const param of node.params) {
                if (isFirst) {
                    isFirst = false
                } else {
                    buffer.concat(format ? "," : ", ");
                }
                c(param, st, "Pattern")
            }
            buffer.concat(")")
            buffer.concat(" => ")
            if (node.expression) {
                buffer.concat("(")
                c(node.body, st, "Expression")
                buffer.concat(")")
            } else {
                c(node.body, st, "BlockStatement")
            }
        }
    },
    Identifier: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            generateObjJ = compiler.options.generateObjJ,
            identifier = node.name;
        if (!st.isPropertyKey) {
            var lvarScope = st.getLvarScope(identifier, true); // Only look inside method/function scope
            var lvar = lvarScope.vars && lvarScope.vars[identifier];
            if (!st.secondMemberExpression && st.currentMethodType() === "-") {
                var ivar = compiler.getIvarForClass(identifier, st);

                if (ivar) {
                    if (lvar) {
                        if (compiler.options.warnings.includes(warningShadowIvar)) compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", node, compiler.source));
                    }
                    else {
                        var nodeStart = node.start;

                        if (!generate) do {    // The Spider Monkey AST tree includes any parentheses in start and end properties so we have to make sure we skip those
                            compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, nodeStart));
                            compiler.lastPos = nodeStart;
                        } while (compiler.source.substr(nodeStart++, 1) === "(")
                        // Save the index in where the "self." string is stored and the node.
                        // These will be used if we find a variable declaration that is hoisting this identifier.
                        ((st.addedSelfToIvars || (st.addedSelfToIvars = Object.create(null)))[identifier] || (st.addedSelfToIvars[identifier] = [])).push({ node: node, index: compiler.jsBuffer.length() });
                        if (!generateObjJ) compiler.jsBuffer.concat("self.", node);
                    }
                } else if (!reservedIdentifiers.test(identifier)) {  // Don't check for warnings if it is a reserved word like self, localStorage, _cmd, etc...
                    var message,
                        classOrGlobal = typeof global[identifier] !== "undefined" || (typeof window !== 'undefined' && typeof window[identifier] !== "undefined") || compiler.getClassDef(identifier),
                        globalVar = st.getLvar(identifier);
                    if (classOrGlobal && (!globalVar || globalVar.type !== "class")) { // It can't be declared with a @class statement.
                        /* Turned off this warning as there are many many warnings when compiling the Cappuccino frameworks - Martin
                        if (lvar) {
                            message = compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides global variable", node, compiler.source));
                        }*/
                    } else if (!globalVar) {
                        if (st.assignment && compiler.options.warnings.includes(warningCreateGlobalInsideFunctionOrMethod)) {
                            message = new GlobalVariableMaybeWarning("Creating global variable inside function or method '" + identifier + "'", node, compiler.source);
                            // Turn off these warnings for this identifier, we only want one.
                            st.vars[identifier] = { type: "remove global warning", node: node };
                        } else if (compiler.options.warnings.includes(warningUnknownClassOrGlobal)) {
                            message = new GlobalVariableMaybeWarning("Using unknown class or uninitialized global variable '" + identifier + "'", node, compiler.source);
                        }
                    }
                    if (message)
                        st.addMaybeWarning(message);
                }
            }
            if (!st.assignment || !st.secondMemberExpression) {
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
                    var possibleHoistedVariable = (lvarScope.possibleHoistedVariables || (lvarScope.possibleHoistedVariables = Object.create(null)))[identifier];

                    if (possibleHoistedVariable == null) {
                        var possibleHoistedVariable = { isRead: 1 };
                        lvarScope.possibleHoistedVariables[identifier] = possibleHoistedVariable;
                    } else {
                        possibleHoistedVariable.isRead++;
                    }

                    if (lvar) {
                        // If the var and scope are already set it should not be different from what we found now.
                        if ((possibleHoistedVariable.variable && possibleHoistedVariable.variable !== lvar) || (possibleHoistedVariable.varScope && possibleHoistedVariable.varScope !== lvarScope)) {
                            throw new Error("Internal inconsistency, var or scope is not the same");
                        }
                        possibleHoistedVariable.variable = lvar;
                        possibleHoistedVariable.varScope = lvarScope;
                    }
                }
            }
        }
        if (generate) compiler.jsBuffer.concat(identifier, node, identifier === "self" ? "self" : null);
    },
    YieldExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer;
        if (generate) {
            buffer = compiler.jsBuffer;
            buffer.concat("yield", node);
            if (node.delegate) buffer.concat("*")
        }
        if (node.argument) {
            if (generate) buffer.concatFormat(format ? format.beforeExpression : " ");
            c(node.argument, st, "Expression");
        }
    },
    // Use this when there should not be a look up to issue warnings or add 'self.' before ivars
    VariablePattern: function (node, st, c) {
        var compiler = st.compiler;
        if (compiler.generate)
            compiler.jsBuffer.concat(node.name, node);
    },
    Literal: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate;
        if (generate) {
            if (node.raw)
                if (node.raw.charAt(0) === "@")
                    compiler.jsBuffer.concat(node.raw.substring(1), node);
                else
                    compiler.jsBuffer.concat(node.raw, node);
            else {
                var value = node.value,
                    doubleQuote = value.indexOf('"') !== -1;
                compiler.jsBuffer.concat(doubleQuote ? "'" : '"', node);
                compiler.jsBuffer.concat(value);
                compiler.jsBuffer.concat(doubleQuote ? "'" : '"');
            }

        } else if (node.raw.charAt(0) === "@") {
            compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            compiler.lastPos = node.start + 1;
        }
    },
    ClassDeclaration: function (node, st, c) {
        const buffer = st.compiler.jsBuffer;
        if (node.type == "ClassExpression") buffer.concat("(")
        buffer.concat("class ");
        if (node.id) c(node.id, st);
        if (node.superClass) {
            buffer.concat(" extends ")
            c(node.superClass, st)
        }
        indentation += indentStep
        c(node.body, st, "ClassBody")
        indentation = indentation.substring(indentationSize)
        if (node.type == "ClassExpression") buffer.concat(")");
    },
    ClassExpression: function (node, st, c) {
        c(node, st, "ClassDeclaration");
    },
    ClassBody: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate;
        if (generate) {
            compiler.jsBuffer.concat(" {\n");
            for (let element of node.body) {
                c(element, st)
                compiler.jsBuffer.concat("\n")
            }
            compiler.jsBuffer.concat("}");
        }
    },
    PropertyDefinition: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;

        if (generate) {
            buffer.concat(indentation)
            if (node.static) buffer.concat("static ")
            if (node.computed) buffer.concat("[")
            c(node.key, st)
            if (node.computed) buffer.concat("]")
            if (node.value) {
                buffer.concat(" = ")
                c(node.value, st)
            }
        }
    },
    MethodDefinition: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
            buffer.concat(indentation)
            if (node.static) buffer.concat("static ")
            if (node.value.async) buffer.concat("async ")
            if (node.kind == "get") buffer.concat("get ")
            if (node.kind == "set") buffer.concat("set ")
            if (node.value.generator) buffer.concat("*")
            if (node.computed) buffer.concat("[")
            c(node.key, st)
            if (format) buffer.concatFormat(format.beforeLeftParenthesis);
            if (node.computed) buffer.concat("]")
            buffer.concat("(");
            for (var i = 0; i < node.value.params.length; ++i) {
                if (i)
                    buffer.concat(format ? "," : ", ");
                c(node.value.params[i], st, "Pattern");
            }
            if (format) {
                buffer.concat(")");
                buffer.concatFormat(format.afterRightParenthesis);
            } else {
                buffer.concat(")");
            }
            indentation += indentStep
            c(node.value.body, st)
            indentation = indentation.substring(indentationSize);

        }
    },
    PrivateIdentifier: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
            buffer.concat("#")
            buffer.concat(node.name)
        }
    },
    MetaProperty: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;

        // Very specific special cases. Apparently this will be used in future versions of ES.
        if (generate) {
            if (node.meta.name == "import") {
                buffer.concat("import.meta")
            } else {
                buffer.concat("new.target")
            }
        }
    },
    Super: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;

        if (generate) {
            buffer.concat("super")
        }
    },
    ExportNamedDeclaration: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;

        // The different cases we can have when we encounter an 'ExportNamedDeclaration'
        // Case 1: declaration is non-null, specifiers are null, source is null. Example: export var foo = 1.
        // Case 2: declaration is null, specifiers are non-null, source is null
        // Case 3: declaration is null, specifiers are non-null, source is non-null

        if (generate) {
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
        }
    },
    ExportSpecifier: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
            c(node.local, st)
            if (node.local !== node.exported) {
                buffer.concat(" as ")
                c(node.exported, st)
            }
        }
    },
    ExportDefaultDeclaration: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        st.isDefaultExport = true
        if (generate) {
            buffer.concat("export default ")
            c(node.declaration, st)
        }
        delete st.isDefaultExport
    },
    ExportAllDeclaration: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;
        if (generate) {
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
        }
    },
    ImportDeclaration: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;

        if (generate) {
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
        }
    },
    ImportExpression: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer;

        if (generate) {
            buffer.concat("import")
            buffer.concat("(")
            c(node.source, st)
            buffer.concat(")")
        }
    },
    ArrayLiteral: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer,
            generateObjJ = compiler.options.generateObjJ,
            elementLength = node.elements.length;
        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            compiler.lastPos = node.start;
        }

        if (!generate) buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        if (!st.receiverLevel) st.receiverLevel = 0;
        if (generateObjJ) {
            buffer.concat("@[");
        } else if (!elementLength) {
            if (compiler.options.inlineMsgSendFunctions) {
                buffer.concat("(___r", node);
                buffer.concat(++st.receiverLevel + "");
                buffer.concat(" = (CPArray.isa.method_msgSend[\"alloc\"] || _objj_forward)(CPArray, \"alloc\"), ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" == null ? ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" : (___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(".isa.method_msgSend[\"init\"] || _objj_forward)(___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(", \"init\"))");
            } else {
                buffer.concat("(___r");
                buffer.concat(++st.receiverLevel + "");
                buffer.concat(" = CPArray.isa.objj_msgSend0(CPArray, \"alloc\"), ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" == null ? ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" : ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(".isa.objj_msgSend0(___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(", \"init\"))");
            }

            if (!(st.maxReceiverLevel >= st.receiverLevel))
                st.maxReceiverLevel = st.receiverLevel;
        } else {
            if (compiler.options.inlineMsgSendFunctions) {
                buffer.concat("(___r", node);
                buffer.concat(++st.receiverLevel + "");
                buffer.concat(" = (CPArray.isa.method_msgSend[\"alloc\"] || _objj_forward)(CPArray, \"alloc\"), ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" == null ? ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" : (___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(".isa.method_msgSend[\"initWithObjects:count:\"] || _objj_forward)(___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(", \"initWithObjects:count:\", [");
            } else {
                buffer.concat("(___r", node);
                buffer.concat(++st.receiverLevel + "");
                buffer.concat(" = CPArray.isa.objj_msgSend0(CPArray, \"alloc\"), ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" == null ? ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" : ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(".isa.objj_msgSend2(___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(", \"initWithObjects:count:\", [");
            }

            if (!(st.maxReceiverLevel >= st.receiverLevel))
                st.maxReceiverLevel = st.receiverLevel;
        }
        if (elementLength) {
            for (var i = 0; i < elementLength; i++) {
                var elt = node.elements[i];

                if (i)
                    buffer.concat(", ");

                if (!generate) compiler.lastPos = elt.start;
                c(elt, st, "Expression");
                if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, elt.end));
            }
            if (!generateObjJ) buffer.concat("], " + elementLength + "))");
        }

        if (generateObjJ)
            buffer.concat("]");
        else
            st.receiverLevel--;

        if (!generate) compiler.lastPos = node.end;
    },
    DictionaryLiteral: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer,
            generateObjJ = compiler.options.generateObjJ,
            keyLength = node.keys.length;
        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            compiler.lastPos = node.start;
        }

        if (!generate) buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        if (!st.receiverLevel) st.receiverLevel = 0;
        if (generateObjJ) {
            buffer.concat("@{");
            for (var i = 0; i < keyLength; i++) {
                if (i !== 0) buffer.concat(",");
                c(node.keys[i], st, "Expression");
                buffer.concat(":");
                c(node.values[i], st, "Expression");
            }
            buffer.concat("}");
        } else if (!keyLength) {
            if (compiler.options.inlineMsgSendFunctions) {
                buffer.concat("(___r", node);
                buffer.concat(++st.receiverLevel + "");
                buffer.concat(" = (CPDictionary.isa.method_msgSend[\"alloc\"] || _objj_forward)(CPDictionary, \"alloc\"), ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" == null ? ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" : (___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(".isa.method_msgSend[\"init\"] || _objj_forward)(___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(", \"init\"))");
            } else {
                buffer.concat("(___r");
                buffer.concat(++st.receiverLevel + "");
                buffer.concat(" = CPDictionary.isa.objj_msgSend0(CPDictionary, \"alloc\"), ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" == null ? ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" : ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(".isa.objj_msgSend0(___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(", \"init\"))");
            }

            if (!(st.maxReceiverLevel >= st.receiverLevel))
                st.maxReceiverLevel = st.receiverLevel;
        } else {
            if (compiler.options.inlineMsgSendFunctions) {
                buffer.concat("(___r", node);
                buffer.concat(++st.receiverLevel + "");
                buffer.concat(" = (CPDictionary.isa.method_msgSend[\"alloc\"] || _objj_forward)(CPDictionary, \"alloc\"), ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" == null ? ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" : (___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(".isa.method_msgSend[\"initWithObjects:forKeys:\"] || _objj_forward)(___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(", \"initWithObjects:forKeys:\", [");
            } else {
                buffer.concat("(___r", node);
                buffer.concat(++st.receiverLevel + "");
                buffer.concat(" = CPDictionary.isa.objj_msgSend0(CPDictionary, \"alloc\"), ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" == null ? ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(" : ___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(".isa.objj_msgSend2(___r");
                buffer.concat(st.receiverLevel + "");
                buffer.concat(", \"initWithObjects:forKeys:\", [");
            }

            if (!(st.maxReceiverLevel >= st.receiverLevel))
                st.maxReceiverLevel = st.receiverLevel;

            for (var i = 0; i < keyLength; i++) {
                var value = node.values[i];

                if (i) buffer.concat(", ");
                if (!generate) compiler.lastPos = value.start;
                c(value, st, "Expression");
                if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, value.end));
            }

            buffer.concat("], [");

            for (var i = 0; i < keyLength; i++) {
                var key = node.keys[i];

                if (i) buffer.concat(", ");

                if (!generate) compiler.lastPos = key.start;
                c(key, st, "Expression");
                if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, key.end));
            }
            buffer.concat("]))");
        }

        if (!generateObjJ)
            st.receiverLevel--;
        if (!generate) compiler.lastPos = node.end;
    },
    ImportStatement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer,
            localfilepath = node.localfilepath,
            generateObjJ = compiler.options.generateObjJ;

        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        if (generateObjJ) {
            buffer.concat("@import ");
            buffer.concat(localfilepath ? "\"" : "<");
            buffer.concat(node.filename.value);
            buffer.concat(localfilepath ? "\"" : ">");
        } else {
            buffer.concat("objj_executeFile(\"", node);
            buffer.concat(node.filename.value);
            buffer.concat(localfilepath ? "\", YES);" : "\", NO);");
        }
        if (!generate) compiler.lastPos = node.end;
    },
    ClassDeclarationStatement: function (node, st, c, format) {
        var compiler = st.compiler,
            generate = compiler.generate,
            saveJSBuffer = compiler.jsBuffer,
            className = node.classname.name,
            classDef = compiler.getClassDef(className),
            classScope = new Scope(st),
            isInterfaceDeclaration = node.type === "InterfaceDeclarationStatement",
            protocols = node.protocols,
            options = compiler.options,
            generateObjJ = options.generateObjJ;

        compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL, options.sourceMap && options.sourceMapIncludeSource ? compiler.source : null);
        compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);
        compiler.classBodyBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);      // TODO: Check if this is needed

        if (compiler.getTypeDef(className))
            throw compiler.error_message(className + " is already declared as a type", node.classname);


        if (!generate) saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));

        // First we declare the class
        if (node.superclassname) {
            // Must have methods dictionaries and ivars dictionary to be a real implementaion declaration.
            // Without it is a "@class" declaration (without both ivars dictionary and method dictionaries) or
            // "interface" declaration (without ivars dictionary)
            // TODO: Create a ClassDef object and add this logic to it
            if (classDef && classDef.ivars)
                // It has a real implementation declaration already
                throw compiler.error_message("Duplicate class " + className, node.classname);

            if (isInterfaceDeclaration && classDef && classDef.instanceMethods && classDef.classMethods)
                // It has a interface declaration already
                throw compiler.error_message("Duplicate interface definition for class " + className, node.classname);
            var superClassDef = compiler.getClassDef(node.superclassname.name);
            if (!superClassDef && !generateObjJ) // Don't throw error for this when generating Objective-J code
            {
                var errorMessage = "Can't find superclass " + node.superclassname.name;
                if (ObjJAcornCompiler.importStack) for (var i = ObjJAcornCompiler.importStack.length; --i >= 0;)
                    errorMessage += "\n" + Array((ObjJAcornCompiler.importStack.length - i) * 2 + 1).join(" ") + "Imported by: " + ObjJAcornCompiler.importStack[i];
                throw compiler.error_message(errorMessage, node.superclassname);
            }

            classDef = new ClassDef(!isInterfaceDeclaration, className, superClassDef, Object.create(null));

            if (!generateObjJ) saveJSBuffer.concat("\n{var the_class = objj_allocateClassPair(" + node.superclassname.name + ", \"" + className + "\"),\nmeta_class = the_class.isa;", node);
        }
        else if (node.categoryname) {
            classDef = compiler.getClassDef(className);
            if (!classDef)
                throw compiler.error_message("Class " + className + " not found ", node.classname);

            if (!generateObjJ) {
                saveJSBuffer.concat("{\nvar the_class = objj_getClass(\"" + className + "\")\n", node);
                saveJSBuffer.concat("if(!the_class) throw new SyntaxError(\"*** Could not find definition for class \\\"" + className + "\\\"\");\n");
                saveJSBuffer.concat("var meta_class = the_class.isa;");
            }
        }
        else {
            classDef = new ClassDef(!isInterfaceDeclaration, className, null, Object.create(null));

            if (!generateObjJ)
                saveJSBuffer.concat("{var the_class = objj_allocateClassPair(Nil, \"" + className + "\"),\nmeta_class = the_class.isa;", node);
        }

        if (generateObjJ) {
            saveJSBuffer.concat(isInterfaceDeclaration ? "@interface " : "@implementation ");
            saveJSBuffer.concat(className);
            if (node.superclassname) {
                saveJSBuffer.concat(" : ");
                c(node.superclassname, st, "VariablePattern");
            } else if (node.categoryname) {
                saveJSBuffer.concat(" (");
                c(node.categoryname, st, "VariablePattern");
                saveJSBuffer.concat(")");
            }
        }

        if (protocols) for (var i = 0, size = protocols.length; i < size; i++) {
            if (generateObjJ) {
                if (i)
                    saveJSBuffer.concat(", ");
                else
                    saveJSBuffer.concat(" <");
                c(protocols[i], st, "VariablePattern");
                if (i === size - 1)
                    saveJSBuffer.concat(">");
            } else {
                saveJSBuffer.concat("\nvar aProtocol = objj_getProtocol(\"" + protocols[i].name + "\");", protocols[i]);
                saveJSBuffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocols[i].name + "\\\"\");");
                saveJSBuffer.concat("\nclass_addProtocol(the_class, aProtocol);");
            }
        }
        /*
            if (isInterfaceDeclaration)
                classDef.interfaceDeclaration = true;
        */
        classScope.classDef = classDef;
        compiler.currentSuperClass = "objj_getClass(\"" + className + "\").super_class";
        compiler.currentSuperMetaClass = "objj_getMetaClass(\"" + className + "\").super_class";

        var firstIvarDeclaration = true,
            ivars = classDef.ivars,
            classDefIvars = [],
            hasAccessors = false;

        // Then we add all ivars
        if (node.ivardeclarations) {
            if (generateObjJ) {
                saveJSBuffer.concat("{");
                indentation += indentStep;
            }

            for (var i = 0; i < node.ivardeclarations.length; ++i) {
                var ivarDecl = node.ivardeclarations[i],
                    ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
                    ivarTypeIsClass = ivarDecl.ivartype ? ivarDecl.ivartype.typeisclass : false,
                    ivarIdentifier = ivarDecl.id,
                    ivarName = ivarIdentifier.name,
                    ivar = { "type": ivarType, "name": ivarName },
                    accessors = ivarDecl.accessors;

                var checkIfIvarIsAlreadyDeclaredAndInSuperClass = function (aClassDef, recursiveFunction) {
                    if (aClassDef.ivars[ivarName])
                        throw compiler.error_message("Instance variable '" + ivarName + "' is already declared for class " + className + (aClassDef.name !== className ? " in superclass " + aClassDef.name : ""), ivarDecl.id);
                    if (aClassDef.superClass)
                        recursiveFunction(aClassDef.superClass, recursiveFunction);
                }

                // Check if ivar is already declared in this class or its super classes.
                checkIfIvarIsAlreadyDeclaredAndInSuperClass(classDef, checkIfIvarIsAlreadyDeclaredAndInSuperClass);

                var isTypeDefined = !ivarTypeIsClass || typeof global[ivarType] !== "undefined" || (typeof window !== "undefined" && typeof window[ivarType] !== "undefined")
                    || compiler.getClassDef(ivarType) || compiler.getTypeDef(ivarType) || ivarType == classDef.name;

                if (!isTypeDefined && compiler.options.warnings.includes(warningUnknownIvarType))
                    compiler.addWarning(createMessage("Unknown type '" + ivarType + "' for ivar '" + ivarName + "'", ivarDecl.ivartype, compiler.source));

                if (generateObjJ) {
                    c(ivarDecl, st, "IvarDeclaration");
                } else {
                    if (firstIvarDeclaration) {
                        firstIvarDeclaration = false;
                        saveJSBuffer.concat("class_addIvars(the_class, [");
                    }
                    else
                        saveJSBuffer.concat(", ");

                    if (options.includeIvarTypeSignatures)
                        saveJSBuffer.concat("new objj_ivar(\"" + ivarName + "\", \"" + ivarType + "\")", node);
                    else
                        saveJSBuffer.concat("new objj_ivar(\"" + ivarName + "\")", node);
                }

                if (ivarDecl.outlet)
                    ivar.outlet = true;

                // Store the classDef ivars into array and add them later when accessors are created to prevent ivar duplicate error when generating accessors
                classDefIvars.push(ivar);

                if (!classScope.ivars)
                    classScope.ivars = Object.create(null);
                classScope.ivars[ivarName] = { type: "ivar", name: ivarName, node: ivarIdentifier, ivar: ivar };

                if (accessors) {
                    // Declare the accessor methods in the class definition.
                    // TODO: This next couple of lines for getting getterName and setterName are duplicated from below. Create functions for this.
                    var property = (accessors.property && accessors.property.name) || ivarName,
                        getterName = (accessors.getter && accessors.getter.name) || property;

                    classDef.addInstanceMethod(new MethodDef(getterName, [ivarType]));

                    if (!accessors.readonly) {
                        var setterName = accessors.setter ? accessors.setter.name : null;

                        if (!setterName) {
                            var start = property.charAt(0) == '_' ? 1 : 0;

                            setterName = (start ? "_" : "") + "set" + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ":";
                        }
                        classDef.addInstanceMethod(new MethodDef(setterName, ["void", ivarType]));
                    }
                    hasAccessors = true;
                }
            }
        }
        if (generateObjJ) {
            indentation = indentation.substring(indentationSize);
            saveJSBuffer.concatFormat("\n}");
        } else if (!firstIvarDeclaration)
            saveJSBuffer.concat("]);");

        // If we have accessors add get and set methods for them
        if (!generateObjJ && !isInterfaceDeclaration && hasAccessors) {
            // We pass false to the string buffer as we don't need source map when we create the Objective-J code for the accessors
            var getterSetterBuffer = new StringBuffer(false);

            // Add the class declaration to compile accessors correctly
            // Remove all protocols from class declaration
            getterSetterBuffer.concat(compiler.source.substring(node.start, node.endOfIvars).replace(/<.*>/g, ""));
            getterSetterBuffer.concat("\n");

            for (var i = 0; i < node.ivardeclarations.length; ++i) {
                var ivarDecl = node.ivardeclarations[i],
                    ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
                    ivarName = ivarDecl.id.name,
                    accessors = ivarDecl.accessors;

                if (!accessors)
                    continue;

                var property = (accessors.property && accessors.property.name) || ivarName,
                    getterName = (accessors.getter && accessors.getter.name) || property,
                    getterCode = "- (" + (ivarType ? ivarType : "id") + ")" + getterName + "\n{\n    return " + ivarName + ";\n}\n";

                getterSetterBuffer.concat(getterCode);

                if (accessors.readonly)
                    continue;

                var setterName = accessors.setter ? accessors.setter.name : null;

                if (!setterName) {
                    var start = property.charAt(0) == '_' ? 1 : 0;

                    setterName = (start ? "_" : "") + "set" + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ":";
                }

                var setterCode = "- (void)" + setterName + "(" + (ivarType ? ivarType : "id") + ")newValue\n{\n    ";

                if (accessors.copy)
                    setterCode += "if (" + ivarName + " !== newValue)\n        " + ivarName + " = [newValue copy];\n}\n";
                else
                    setterCode += ivarName + " = newValue;\n}\n";

                getterSetterBuffer.concat(setterCode);
            }

            getterSetterBuffer.concat("\n@end");

            // Remove all @accessors or we will get a recursive loop in infinity
            var b = getterSetterBuffer.toString().replace(/@accessors(\(.*\))?/g, "");
            var compilerOptions = setupOptions(options);

            compilerOptions.sourceMapIncludeSource = true;
            var url = compiler.url;
            var filename = url && compiler.URL.substr(compiler.URL.lastIndexOf('/') + 1);
            var dotIndex = filename && filename.lastIndexOf(".");
            var filenameNoExt = filename && (filename.substr(0, dotIndex === -1 ? filename.length : dotIndex));
            var filenameExt = filename && filename.substr(dotIndex === -1 ? filename.length : dotIndex);
            var categoryname = node.categoryname && node.categoryname.id;
            var imBuffer = exports.compileToIMBuffer(b, filenameNoExt + "_" + className + (categoryname ? "_" + categoryname : "") + "_Accessors" + (filenameExt || ""), compilerOptions);

            // Add the accessors methods first to instance method buffer.
            // This will allow manually added set and get methods to override the compiler generated
            var generatedCode = imBuffer.toString();

            if (compiler.createSourceMap) {
                compiler.imBuffer.concat(sourceMap.SourceNode.fromStringWithSourceMap(generatedCode.code, sourceMap.SourceMapConsumer(generatedCode.map.toString())));
            } else {
                compiler.imBuffer.concat(generatedCode);
            }
        }

        // We will store the ivars into the classDef first after accessors are done so we don't get a duplicate ivars error when generating accessors
        for (var ivarSize = classDefIvars.length, i = 0; i < ivarSize; i++) {
            var ivar = classDefIvars[i],
                ivarName = ivar.name;

            // Store the ivar into the classDef
            ivars[ivarName] = ivar;
        }

        // We will store the classDef first after accessors are done so we don't get a duplicate class error when generating accessors
        compiler.classDefs[className] = classDef;

        var bodies = node.body,
            bodyLength = bodies.length;

        if (bodyLength > 0) {
            if (!generate) compiler.lastPos = bodies[0].start;

            // And last add methods and other statements
            for (var i = 0; i < bodyLength; ++i) {
                var body = bodies[i];
                c(body, classScope, "Statement");
            }
            if (!generate) saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, body.end));
        }

        // We must make a new class object for our class definition if it's not a category
        if (!generateObjJ && !isInterfaceDeclaration && !node.categoryname) {
            saveJSBuffer.concat("objj_registerClassPair(the_class);\n");
        }

        // Add instance methods
        if (!generateObjJ && compiler.imBuffer.isEmpty()) {
            saveJSBuffer.concat("class_addMethods(the_class, [");
            saveJSBuffer.appendStringBuffer(compiler.imBuffer);
            saveJSBuffer.concat("]);\n");
        }

        // Add class methods
        if (!generateObjJ && compiler.cmBuffer.isEmpty()) {
            saveJSBuffer.concat("class_addMethods(meta_class, [");
            saveJSBuffer.appendStringBuffer(compiler.cmBuffer);
            saveJSBuffer.concat("]);\n");
        }

        if (!generateObjJ) saveJSBuffer.concat("}\n");

        compiler.jsBuffer = saveJSBuffer;

        // Skip the "@end"
        if (!generate) compiler.lastPos = node.end;

        if (generateObjJ)
            saveJSBuffer.concat("\n@end");

        // If the class conforms to protocols check that all required methods are implemented
        if (protocols) {
            // Lookup the protocolDefs for the protocols
            var protocolDefs = [];

            for (var i = 0, size = protocols.length; i < size; i++) {
                var protocol = protocols[i],
                    protocolDef = compiler.getProtocolDef(protocol.name);

                if (!protocolDef)
                    throw compiler.error_message("Cannot find protocol declaration for '" + protocol.name + "'", protocol);

                protocolDefs.push(protocolDef);
            }

            var unimplementedMethods = classDef.listOfNotImplementedMethodsForProtocols(protocolDefs);

            if (unimplementedMethods && unimplementedMethods.length > 0)
                for (var j = 0, unimpSize = unimplementedMethods.length; j < unimpSize; j++) {
                    var unimplementedMethod = unimplementedMethods[j],
                        methodDef = unimplementedMethod.methodDef,
                        protocolDef = unimplementedMethod.protocolDef;

                    compiler.addWarning(createMessage("Method '" + methodDef.name + "' in protocol '" + protocolDef.name + "' is not implemented", node.classname, compiler.source));
                }
        }
    },
    ProtocolDeclarationStatement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer,
            protocolName = node.protocolname.name,
            protocolDef = compiler.getProtocolDef(protocolName),
            protocols = node.protocols,
            protocolScope = new Scope(st),
            inheritFromProtocols = [],
            generateObjJ = compiler.options.generateObjJ;

        if (protocolDef)
            throw compiler.error_message("Duplicate protocol " + protocolName, node.protocolname);

        compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);
        compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);

        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

        if (generateObjJ) {
            buffer.concat("@protocol ");
            c(node.protocolname, st, "VariablePattern");
        } else {
            buffer.concat("{var the_protocol = objj_allocateProtocol(\"" + protocolName + "\");", node);
        }

        if (protocols) {
            if (generateObjJ)
                buffer.concat(" <");

            for (var i = 0, size = protocols.length; i < size; i++) {
                var protocol = protocols[i],
                    inheritFromProtocolName = protocol.name,
                    inheritProtocolDef = compiler.getProtocolDef(inheritFromProtocolName);

                if (!inheritProtocolDef)
                    throw compiler.error_message("Can't find protocol " + inheritFromProtocolName, protocol);

                if (generateObjJ) {
                    if (i)
                        buffer.concat(", ");

                    c(protocol, st, "VariablePattern");
                } else {
                    buffer.concat("\nvar aProtocol = objj_getProtocol(\"" + inheritFromProtocolName + "\");", node);
                    buffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocolName + "\\\"\");", node);
                    buffer.concat("\nprotocol_addProtocol(the_protocol, aProtocol);", node);
                }

                inheritFromProtocols.push(inheritProtocolDef);
            }

            if (generateObjJ)
                buffer.concat(">");
        }

        protocolDef = new ProtocolDef(protocolName, inheritFromProtocols);
        compiler.protocolDefs[protocolName] = protocolDef;
        protocolScope.protocolDef = protocolDef;

        var someRequired = node.required;

        if (someRequired) {
            var requiredLength = someRequired.length;

            if (requiredLength > 0) {
                // We only add the required methods
                for (var i = 0; i < requiredLength; ++i) {
                    var required = someRequired[i];
                    if (!generate) compiler.lastPos = required.start;
                    c(required, protocolScope, "Statement");
                }
                if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, required.end));
            }
        }

        if (generateObjJ) {
            buffer.concatFormat("\n@end");
        } else {
            buffer.concat("\nobjj_registerProtocol(the_protocol);\n");

            // Add instance methods
            if (compiler.imBuffer.isEmpty()) {
                buffer.concat("protocol_addMethodDescriptions(the_protocol, [");
                buffer.appendStringBuffer(compiler.imBuffer);
                buffer.concat("], true, true);\n");
            }

            // Add class methods
            if (compiler.cmBuffer.isEmpty()) {
                buffer.concat("protocol_addMethodDescriptions(the_protocol, [");
                buffer.appendStringBuffer(compiler.cmBuffer);
                buffer.concat("], true, false);\n");
            }

            buffer.concat("}");
        }

        compiler.jsBuffer = buffer;

        // Skip the "@end"
        if (!generate) compiler.lastPos = node.end;
    },
    IvarDeclaration: function (node, st, c, format) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer;

        if (node.outlet)
            buffer.concat("@outlet ");
        c(node.ivartype, st, "VariablePattern");
        buffer.concat(" ");
        c(node.id, st, "VariablePattern");
        if (node.accessors)
            buffer.concat(" @accessors");
    },
    MethodDeclarationStatement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            saveJSBuffer = compiler.jsBuffer,
            methodScope = new FunctionScope(st),
            isInstanceMethodType = node.methodtype === '-',
            selectors = node.selectors,
            nodeArguments = node.arguments,
            returnType = node.returntype,
            types = [returnType ? returnType.name : (node.action ? "void" : "id")], // Return type is 'id' as default except if it is an action declared method, then it's 'void'
            returnTypeProtocols = returnType ? returnType.protocols : null,
            selector = selectors[0].name,    // There is always at least one selector
            generateObjJ = compiler.options.generateObjJ;

        if (returnTypeProtocols) for (var i = 0, size = returnTypeProtocols.length; i < size; i++) {
            var returnTypeProtocol = returnTypeProtocols[i];
            if (!compiler.getProtocolDef(returnTypeProtocol.name)) {
                compiler.addWarning(createMessage("Cannot find protocol declaration for '" + returnTypeProtocol.name + "'", returnTypeProtocol, compiler.source));
            }
        }

        if (!generate) saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));

        // If we are generating objective-J code write everything directly to the regular buffer
        // Otherwise we have one for instance methods and one for class methods.
        if (generateObjJ) {
            compiler.jsBuffer.concat(isInstanceMethodType ? "- (" : "+ (");
            compiler.jsBuffer.concat(types[0]);
            compiler.jsBuffer.concat(")");
        } else {
            compiler.jsBuffer = isInstanceMethodType ? compiler.imBuffer : compiler.cmBuffer;
        }

        // Put together the selector. Maybe this should be done in the parser...
        // Or maybe we should do it here as when genereting Objective-J code it's kind of handy
        var size = nodeArguments.length;
        if (size > 0) {
            for (var i = 0; i < nodeArguments.length; i++) {
                var argument = nodeArguments[i],
                    argumentType = argument.type,
                    argumentTypeName = argumentType ? argumentType.name : "id",
                    argumentProtocols = argumentType ? argumentType.protocols : null;

                types.push(argumentTypeName);

                if (i === 0)
                    selector += ":";
                else
                    selector += (selectors[i] ? selectors[i].name : "") + ":";

                if (argumentProtocols) for (var j = 0, size = argumentProtocols.length; j < size; j++) {
                    var argumentProtocol = argumentProtocols[j];
                    if (!compiler.getProtocolDef(argumentProtocol.name)) {
                        compiler.addWarning(createMessage("Cannot find protocol declaration for '" + argumentProtocol.name + "'", argumentProtocol, compiler.source));
                    }
                }

                if (generateObjJ) {
                    var aSelector = selectors[i];

                    if (i)
                        compiler.jsBuffer.concat(" ");

                    compiler.jsBuffer.concat((aSelector ? aSelector.name : "") + ":");
                    compiler.jsBuffer.concat("(");
                    compiler.jsBuffer.concat(argumentTypeName);
                    if (argumentProtocols) {
                        compiler.jsBuffer.concat(" <");
                        for (var j = 0, size = argumentProtocols.length; j < size; j++) {
                            var argumentProtocol = argumentProtocols[j];

                            if (j)
                                compiler.jsBuffer.concat(", ");

                            compiler.jsBuffer.concat(argumentProtocol.name);
                        }

                        compiler.jsBuffer.concat(">");
                    }
                    compiler.jsBuffer.concat(")");
                    c(argument.identifier, st, "VariablePattern");
                }
            }
        } else if (generateObjJ) {
            var selectorNode = selectors[0];
            compiler.jsBuffer.concat(selectorNode.name, selectorNode);
        }

        if (generateObjJ) {
            if (node.parameters) {
                compiler.jsBuffer.concat(", ...");
            }
        } else {
            if (compiler.jsBuffer.isEmpty())           // Add comma separator if this is not first method in this buffer
                compiler.jsBuffer.concat(", ");

            compiler.jsBuffer.concat("new objj_method(sel_getUid(\"", node);
            compiler.jsBuffer.concat(selector);
            compiler.jsBuffer.concat("\"), ");
        }

        if (node.body) {
            if (!generateObjJ) {
                if (node.returntype && node.returntype.async)
                    compiler.jsBuffer.concat("async ");
                compiler.jsBuffer.concat("function");

                if (compiler.options.includeMethodFunctionNames) {
                    compiler.jsBuffer.concat(" $" + st.currentClassName() + "__" + selector.replace(/:/g, "_"));
                }

                compiler.jsBuffer.concat("(self, _cmd");
            }

            methodScope.methodType = node.methodtype;
            methodScope.vars["self"] = { type: "method base", scope: methodScope };
            methodScope.vars["_cmd"] = { type: "method base", scope: methodScope };

            if (nodeArguments) for (var i = 0; i < nodeArguments.length; i++) {
                var argument = nodeArguments[i],
                    argumentName = argument.identifier.name;

                if (!generateObjJ) {
                    compiler.jsBuffer.concat(", ");
                    compiler.jsBuffer.concat(argumentName, argument.identifier);
                }
                methodScope.vars[argumentName] = { type: "method argument", node: argument };
            }

            if (!generateObjJ)
                compiler.jsBuffer.concat(")\n");

            if (!generate) compiler.lastPos = node.startOfBody;
            indentation += indentStep;
            methodScope.endOfScopeBody = true;
            c(node.body, methodScope, "Statement");
            methodScope.variablesNotReadWarnings();
            indentation = indentation.substring(indentationSize);
            if (!generate) compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.body.end));

            if (!generateObjJ)
                compiler.jsBuffer.concat("\n");
        } else { // It is a interface or protocol declatartion and we don't have a method implementation
            if (generateObjJ)
                compiler.jsBuffer.concat(";");
            else
                compiler.jsBuffer.concat("Nil\n");
        }

        if (!generateObjJ) {
            if (compiler.options.includeMethodArgumentTypeSignatures)
                compiler.jsBuffer.concat("," + JSON.stringify(types));
            compiler.jsBuffer.concat(")");
            compiler.jsBuffer = saveJSBuffer;
        }

        if (!generate) compiler.lastPos = node.end;

        // Add the method to the class or protocol definition
        var def = st.classDef,
            alreadyDeclared;

        // But first, if it is a class definition check if it is declared in superclass or interface declaration
        if (def)
            alreadyDeclared = isInstanceMethodType ? def.getInstanceMethod(selector) : def.getClassMethod(selector);
        else
            def = st.protocolDef;

        if (!def)
            throw "InternalError: MethodDeclaration without ClassDeclaration or ProtocolDeclaration at line: " + objjParser.getLineInfo(compiler.source, node.start).line;

        // Create warnings if types does not corresponds to method declaration in superclass or interface declarations
        // If we don't find the method in superclass or interface declarations above or if it is a protocol
        // declaration, try to find it in any of the conforming protocols
        if (!alreadyDeclared) {
            var protocols = def.protocols;

            if (protocols) for (var i = 0, size = protocols.length; i < size; i++) {
                var protocol = protocols[i],
                    alreadyDeclared = isInstanceMethodType ? protocol.getInstanceMethod(selector) : protocol.getClassMethod(selector);

                if (alreadyDeclared)
                    break;
            }
        }

        if (alreadyDeclared) {
            var declaredTypes = alreadyDeclared.types;

            if (declaredTypes) {
                var typeSize = declaredTypes.length;
                if (typeSize > 0) {
                    // First type is return type
                    var declaredReturnType = declaredTypes[0];

                    // Create warning if return types is not the same. It is ok if superclass has 'id' and subclass has a class type
                    if (declaredReturnType !== types[0] && !(declaredReturnType === 'id' && returnType && returnType.typeisclass))
                        compiler.addWarning(createMessage("Conflicting return type in implementation of '" + selector + "': '" + declaredReturnType + "' vs '" + types[0] + "'", returnType || node.action || selectors[0], compiler.source));

                    // Check the parameter types. The size of the two type arrays should be the same as they have the same selector.
                    for (var i = 1; i < typeSize; i++) {
                        var parameterType = declaredTypes[i];

                        if (parameterType !== types[i] && !(parameterType === 'id' && nodeArguments[i - 1].type.typeisclass))
                            compiler.addWarning(createMessage("Conflicting parameter types in implementation of '" + selector + "': '" + parameterType + "' vs '" + types[i] + "'", nodeArguments[i - 1].type || nodeArguments[i - 1].identifier, compiler.source));
                    }
                }
            }
        }

        // Now we add it
        var methodDef = new MethodDef(selector, types);

        if (isInstanceMethodType)
            def.addInstanceMethod(methodDef);
        else
            def.addClassMethod(methodDef);
    },
    MessageSendExpression: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            inlineMsgSend = compiler.options.inlineMsgSendFunctions,
            buffer = compiler.jsBuffer,
            nodeObject = node.object,
            selectors = node.selectors,
            nodeArguments = node.arguments,
            argumentsLength = nodeArguments.length,
            firstSelector = selectors[0],
            selector = firstSelector ? firstSelector.name : "",    // There is always at least one selector
            parameters = node.parameters,
            options = compiler.options,
            generateObjJ = options.generateObjJ;

        // Put together the selector. Maybe this should be done in the parser...
        for (var i = 0; i < argumentsLength; i++) {
            if (i !== 0) {
                var nextSelector = selectors[i];
                if (nextSelector)
                    selector += nextSelector.name;
            }
            selector += ":";
        }

        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            compiler.lastPos = nodeObject ? nodeObject.start : node.arguments.length ? node.arguments[0].start : node.end;
        } else if (!inlineMsgSend) {
            // Find out the total number of arguments so we can choose appropriate msgSend function. Only needed if call the function and not inline it
            var totalNoOfParameters = argumentsLength;

            if (parameters)
                totalNoOfParameters += parameters.length;
        }
        if (node.superObject) {
            if (!generate) buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
            if (generateObjJ) {
                buffer.concat("[super ");
            } else {
                if (inlineMsgSend) {
                    buffer.concat("(", node);
                    buffer.concat(st.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass);
                    buffer.concat(".method_dtable[\"", node);
                    buffer.concat(selector);
                    buffer.concat("\"] || _objj_forward)(self", node);
                } else {
                    buffer.concat("objj_msgSendSuper", node);
                    if (totalNoOfParameters < 4) {
                        buffer.concat("" + totalNoOfParameters);
                    }
                    buffer.concat("({ receiver:self, super_class:" + (st.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass) + " }", node);
                }
            }
        }
        else {
            if (generateObjJ) {
                buffer.concat("[");
                c(nodeObject, st, "Expression");
            } else {
                if (generate) {
                    // If the recevier is not an identifier or an ivar that should have 'self.' infront we need to assign it to a temporary variable
                    // If it is 'self' we assume it will never be nil and remove that test
                    var receiverIsIdentifier = nodeObject.type === "Identifier" && !(st.currentMethodType() === "-" && compiler.getIvarForClass(nodeObject.name, st) && !st.getLvar(nodeObject.name, true)),
                        selfLvar,
                        receiverIsNotSelf;

                    if (receiverIsIdentifier) {
                        var name = nodeObject.name,
                            selfLvar = st.getLvar(name);

                        if (name === "self") {
                            receiverIsNotSelf = !selfLvar || !selfLvar.scope || selfLvar.scope.assignmentToSelf;
                        } else {
                            receiverIsNotSelf = !!selfLvar || !compiler.getClassDef(name);
                        }

                        if (receiverIsNotSelf) {
                            buffer.concat("(", node);
                            c(nodeObject, st, "Expression");
                            buffer.concat(" == null ? ", node);
                            c(nodeObject, st, "Expression");
                            buffer.concat(" : ", node);
                        }
                        if (inlineMsgSend)
                            buffer.concat("(", node);
                        c(nodeObject, st, "Expression");
                    } else {
                        receiverIsNotSelf = true;
                        if (!st.receiverLevel) st.receiverLevel = 0;
                        buffer.concat("((___r" + ++st.receiverLevel, node);
                        buffer.concat(" = ", node);
                        c(nodeObject, st, "Expression");
                        buffer.concat(")", node);
                        buffer.concat(", ___r" + st.receiverLevel, node);
                        buffer.concat(" == null ? ", node);
                        buffer.concat("___r" + st.receiverLevel, node);
                        buffer.concat(" : ", node);
                        if (inlineMsgSend)
                            buffer.concat("(", node);
                        buffer.concat("___r" + st.receiverLevel, node);
                        if (!(st.maxReceiverLevel >= st.receiverLevel))
                            st.maxReceiverLevel = st.receiverLevel;
                    }
                    if (inlineMsgSend) {
                        buffer.concat(".isa.method_msgSend[\"", node);
                        buffer.concat(selector, node);
                        buffer.concat("\"] || _objj_forward)", node);
                    } else {
                        buffer.concat(".isa.objj_msgSend", node);
                    }
                } else {
                    buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
                    buffer.concat("objj_msgSend(");
                    buffer.concat(compiler.source.substring(compiler.lastPos, nodeObject.end));
                }
            }
        }

        if (generateObjJ) {
            for (var i = 0; i < argumentsLength || (argumentsLength === 0 && i === 0); i++) {
                var selector = selectors[i];

                buffer.concat(" ");
                buffer.concat(selector ? selector.name : "");

                if (argumentsLength > 0) {
                    var argument = nodeArguments[i];

                    buffer.concat(":");
                    c(argument, st, "Expression");
                }
            }

            if (parameters) for (var i = 0, size = parameters.length; i < size; ++i) {
                var parameter = parameters[i];

                buffer.concat(", ");
                c(parameter, st, "Expression");
            }
            buffer.concat("]");
        } else {
            var selectorJSPath;

            if (generate && !node.superObject) {
                if (!inlineMsgSend) {
                    if (totalNoOfParameters < 4) {
                        buffer.concat("" + totalNoOfParameters, node);
                    }
                }

                if (receiverIsIdentifier) {
                    buffer.concat("(", node);
                    c(nodeObject, st, "Expression");
                } else {
                    buffer.concat("(___r" + st.receiverLevel, node);
                }

                // Only do this if source map is enabled and we have an identifier
                if (options.sourceMap && nodeObject.type === "Identifier") {
                    // Get target expression for sourcemap to allow hovering selector to show method function. Create new buffer to write in.
                    compiler.jsBuffer = new StringBuffer();
                    c(nodeObject, st, "Expression");
                    var aTarget = compiler.jsBuffer.toString();
                    selectorJSPath = aTarget + ".isa.method_dtable[\"" + selector + "\"]"
                    // Restored buffer so everything will continue as usually.
                    compiler.jsBuffer = buffer;
                }
            }

            buffer.concat(", ", node);
            if (selectorJSPath) {
                buffer.concat("(", node);
                for (var i = 0; i < selectors.length; i++) {
                    var nextSelector = selectors[i];
                    if (nextSelector) {
                        buffer.concat(selectorJSPath, nextSelector);
                        buffer.concat(", ", node);
                    }
                }
            }
            buffer.concat("\"", node);

            buffer.concat(selector, node); // FIXME: sel_getUid(selector + "") ? This FIXME is from the old preprocessor compiler
            buffer.concat(selectorJSPath ? "\")" : "\"", node);

            if (nodeArguments) for (var i = 0; i < nodeArguments.length; i++) {
                var argument = nodeArguments[i];

                buffer.concat(", ", node);
                if (!generate)
                    compiler.lastPos = argument.start;
                c(argument, st, "Expression");
                if (!generate) {
                    buffer.concat(compiler.source.substring(compiler.lastPos, argument.end));
                    compiler.lastPos = argument.end;
                }
            }

            if (parameters) for (var i = 0; i < parameters.length; ++i) {
                var parameter = parameters[i];

                buffer.concat(", ", node);
                if (!generate)
                    compiler.lastPos = parameter.start;
                c(parameter, st, "Expression");
                if (!generate) {
                    buffer.concat(compiler.source.substring(compiler.lastPos, parameter.end));
                    compiler.lastPos = parameter.end;
                }
            }

            if (generate && !node.superObject) {
                if (receiverIsNotSelf)
                    buffer.concat(")", node);
                if (!receiverIsIdentifier)
                    st.receiverLevel--;
            }

            buffer.concat(")", node);
        }

        if (!generate) compiler.lastPos = node.end;
    },
    SelectorLiteralExpression: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer,
            generate = compiler.generate,
            generateObjJ = compiler.options.generateObjJ;

        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            buffer.concat(" "); // Add an extra space if it looks something like this: "return(@selector(a:))". No space between return and expression.
        }

        buffer.concat(generateObjJ ? "@selector(" : "sel_getUid(\"", node);
        buffer.concat(node.selector);
        buffer.concat(generateObjJ ? ")" : "\")");

        if (!generate) compiler.lastPos = node.end;
    },
    ProtocolLiteralExpression: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer,
            generate = compiler.generate,
            generateObjJ = compiler.options.generateObjJ;

        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            buffer.concat(" "); // Add an extra space if it looks something like this: "return(@protocol(a))". No space between return and expression.
        }
        buffer.concat(generateObjJ ? "@protocol(" : "objj_getProtocol(\"", node);
        c(node.id, st, "VariablePattern");
        buffer.concat(generateObjJ ? ")" : "\")");
        if (!generate) compiler.lastPos = node.end;
    },
    Reference: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer,
            generate = compiler.generate,
            generateObjJ = compiler.options.generateObjJ;

        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        }
        if (generateObjJ) {
            buffer.concat("@ref(", node);
            buffer.concat(node.element.name, node.element);
            buffer.concat(")", node);
        } else {
            buffer.concat("function(__input) { if (arguments.length) return ", node);
            c(node.element, st, "Expression");
            buffer.concat(" = __input; return ");
            c(node.element, st, "Expression");
            buffer.concat("; }");
        }

        if (!generate) compiler.lastPos = node.end;
    },
    Dereference: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer,
            generate = compiler.generate,
            generateObjJ = compiler.options.generateObjJ;

        checkCanDereference(st, node.expr);

        // @deref(y) -> y()
        // @deref(@deref(y)) -> y()()
        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            compiler.lastPos = node.expr.start;
        }
        if (generateObjJ)
            buffer.concat("@deref(");
        c(node.expr, st, "Expression");
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.expr.end));
        if (generateObjJ)
            buffer.concat(")");
        else
            buffer.concat("()");
        if (!generate) compiler.lastPos = node.end;
    },
    ClassStatement: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer,
            generateObjJ = compiler.options.generateObjJ;
        if (!compiler.generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            compiler.lastPos = node.start;
            buffer.concat("//");
        }
        if (generateObjJ) {
            buffer.concat("@class ");
            c(node.id, st, "VariablePattern");
        }
        var className = node.id.name;

        if (compiler.getTypeDef(className))
            throw compiler.error_message(className + " is already declared as a type", node.id);

        if (!compiler.getClassDef(className)) {
            compiler.classDefs[className] = new ClassDef(false, className);
        }
        st.vars[node.id.name] = { type: "class", node: node.id };
    },
    GlobalStatement: function (node, st, c) {
        var compiler = st.compiler,
            buffer = compiler.jsBuffer,
            generateObjJ = compiler.options.generateObjJ;
        if (!compiler.generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            compiler.lastPos = node.start;
            buffer.concat("//");
        }
        if (generateObjJ) {
            buffer.concat("@global ");
            c(node.id, st, "VariablePattern");
        }
        st.rootScope().vars[node.id.name] = { type: "global", node: node.id };
    },
    PreprocessStatement: function (node, st, c) {
        var compiler = st.compiler;
        if (!compiler.generate) {
            compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
            compiler.lastPos = node.start;
            compiler.jsBuffer.concat("//");
        }
    },
    TypeDefStatement: function (node, st, c) {
        var compiler = st.compiler,
            generate = compiler.generate,
            buffer = compiler.jsBuffer,
            typeDefName = node.typedefname.name,
            typeDef = compiler.getTypeDef(typeDefName),
            typeDefScope = new Scope(st);

        if (typeDef)
            throw compiler.error_message("Duplicate type definition " + typeDefName, node.typedefname);

        if (compiler.getClassDef(typeDefName))
            throw compiler.error_message(typeDefName + " is already declared as class", node.typedefname);

        if (!generate)
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

        buffer.concat("{var the_typedef = objj_allocateTypeDef(\"" + typeDefName + "\");", node);

        typeDef = new TypeDef(typeDefName);
        compiler.typeDefs[typeDefName] = typeDef;
        typeDefScope.typeDef = typeDef;

        buffer.concat("\nobjj_registerTypeDef(the_typedef);\n");

        buffer.concat("}");

        // Skip to the end
        if (!generate)
            compiler.lastPos = node.end;
    }
});