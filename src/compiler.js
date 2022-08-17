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

"use strict";

export const version = "0.3.7";

import * as objjParser from "objj-parser";

import { Scope, FunctionScope } from "./scope.js";
import { StringBuffer } from "./buffer.js";
import { defaultOptions } from "./options.js";
import { pass2, pass1 } from "./walk.js";
import { TypeDef } from "./definition.js";
import { ClassDef } from "./class-def.js";
import { ProtocolDef } from "./protocol.js";
import { MethodDef } from "./definition.js";
import { setupOptions } from "./options.js";

export class ObjJAcornCompiler {

    constructor(/*String*/ aString, /*CFURL*/ aURL, options) {

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

        //this.formatDescription = {
        //    Identifier: {before:"<before>", after:"<after>", parent: {ReturnStatement: {after:"<AFTER>", before:"<BEFORE>"}, Statement: {after:"<After>", before:"<Before>"}}},
        //    BlockStatement: {before:" ", after:"", afterLeftBrace: "\n", beforeRightBrace: "/* Before Brace */"},
        //    Statement: {before:"", after:"/*Statement after*/;\n"}
        //};

        var acornOptions = options.acornOptions;

        if (acornOptions) {
            if (this.URL)
                acornOptions.sourceFile = this.URL.substr(this.URL.lastIndexOf('/') + 1);
            if (options.sourceMap && !acornOptions.locations)
                acornOptions.locations = true;
        }
        else {
            acornOptions = options.acornOptions = this.URL && { sourceFile: this.URL.substr(this.URL.lastIndexOf('/') + 1) };
            if (options.sourceMap)
                acornOptions.locations = true;
        }

        if (options.macros) {
            if (acornOptions.macros)
                acornOptions.macros.concat(options.macros);
            else
                acornOptions.macros = options.macros;
        }

        acornOptions.preprocess = true;
        acornOptions.objj = true

        try {
            this.tokens = objjParser.parse(aString, options.acornOptions);
            this.compile(this.tokens, new Scope(null, { compiler: this }), this.pass === 2 ? pass2 : pass1);
        }
        catch (e) {
            if (e.lineStart != null) {
                e.messageForLine = aString.substring(e.lineStart, e.lineEnd);
            }
            this.addWarning(e);
            return;
        }

        this.setCompiledCode(this.jsBuffer);
    }

    setCompiledCode(stringBuffer) {
        if (this.createSourceMap) {
            var s = stringBuffer.toString();
            this.compiledCode = s.code;
            this.sourceMap = s.map;
        }
        else {
            this.compiledCode = stringBuffer.toString();
        }
    }


    compilePass2() {
        var options = this.options;

        exports.currentCompileFile = this.URL;
        this.pass = options.pass = 2;
        this.jsBuffer = new StringBuffer(this.createSourceMap, this.URL, options.sourceMap && options.sourceMapIncludeSource ? this.source : null);

        // To get the source mapping correct when the new Function construtor is used we add a
        // new line as first thing in the code.
        if (this.createSourceMap)
            this.jsBuffer.concat("\n\n");

        this.warningsAndErrors = [];
        try {
            this.compile(this.tokens, new Scope(null, { compiler: this }), pass2);
        } catch (e) {
            this.addWarning(e);
            return null;
        }

        this.setCompiledCode(this.jsBuffer);

        return this.compiledCode;
    }

    /*!
        Add warning or error to the list
     */
    addWarning(/* Warning */ aWarning) {
        if (aWarning.path == null)
            aWarning.path = this.URL;

        this.warningsAndErrors.push(aWarning);
    }

    getIvarForClass(/* String */ ivarName, /* Scope */ scope) {
        var ivar = scope.getIvarForCurrentClass(ivarName);

        if (ivar)
            return ivar;

        var c = this.getClassDef(scope.currentClassName());

        while (c) {
            var ivars = c.ivars;
            if (ivars) {
                var ivarDef = ivars[ivarName];
                if (ivarDef)
                    return ivarDef;
            }
            c = c.superClass;
        }
    }

    getClassDef(/* String */ aClassName) {
        if (!aClassName) return null;

        var c = this.classDefs[aClassName];

        if (c) return c;

        if (typeof objj_getClass === 'function') {
            var aClass = objj_getClass(aClassName);
            if (aClass) {
                var ivars = class_copyIvarList(aClass),
                    ivarSize = ivars.length,
                    myIvars = Object.create(null),
                    protocols = class_copyProtocolList(aClass),
                    protocolSize = protocols.length,
                    myProtocols = Object.create(null),
                    instanceMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(class_copyMethodList(aClass)),
                    classMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(class_copyMethodList(aClass.isa)),
                    superClass = class_getSuperclass(aClass);

                for (var i = 0; i < ivarSize; i++) {
                    var ivar = ivars[i];

                    myIvars[ivar.name] = { "type": ivar.type, "name": ivar.name };
                }

                for (var i = 0; i < protocolSize; i++) {
                    var protocol = protocols[i],
                        protocolName = protocol_getName(protocol),
                        protocolDef = this.getProtocolDef(protocolName);

                    myProtocols[protocolName] = protocolDef;
                }

                c = new ClassDef(true, aClassName, superClass ? this.getClassDef(superClass.name) : null, myIvars, instanceMethodDefs, classMethodDefs, myProtocols);
                this.classDefs[aClassName] = c;
                return c;
            }
        }

        return null;
    }

    getProtocolDef(/* String */ aProtocolName) {
        if (!aProtocolName) return null;

        var p = this.protocolDefs[aProtocolName];

        if (p) return p;

        if (typeof objj_getProtocol === 'function') {
            var aProtocol = objj_getProtocol(aProtocolName);
            if (aProtocol) {
                var protocolName = protocol_getName(aProtocol),
                    requiredInstanceMethods = protocol_copyMethodDescriptionList(aProtocol, true, true),
                    requiredInstanceMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(requiredInstanceMethods),
                    requiredClassMethods = protocol_copyMethodDescriptionList(aProtocol, true, false),
                    requiredClassMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(requiredClassMethods),
                    protocols = aProtocol.protocols,
                    inheritFromProtocols = [];

                if (protocols)
                    for (var i = 0, size = protocols.length; i < size; i++)
                        inheritFromProtocols.push(compiler.getProtocolDef(protocols[i].name));

                p = new ProtocolDef(protocolName, inheritFromProtocols, requiredInstanceMethodDefs, requiredClassMethodDefs);

                this.protocolDefs[aProtocolName] = p;
                return p;
            }
        }

        return null;
        //  protocolDef = {"name": protocolName, "protocols": Object.create(null), "required": Object.create(null), "optional": Object.create(null)};
    }

    getTypeDef(/* String */ aTypeDefName) {
        if (!aTypeDefName)
            return null;

        var t = this.typeDefs[aTypeDefName];

        if (t)
            return t;

        if (typeof objj_getTypeDef === 'function') {
            var aTypeDef = objj_getTypeDef(aTypeDefName);
            if (aTypeDef) {
                var typeDefName = typeDef_getName(aTypeDef)
                t = new TypeDef(typeDefName);
                this.typeDefs[typeDefName] = t;
                return t;
            }
        }

        return null;
    }

    //FIXME: Does not work anymore
    executable() {
        if (!this._executable)
            this._executable = new Executable(this.jsBuffer ? this.jsBuffer.toString() : null, this.dependencies, this.URL, null, this);
        return this._executable;
    }

    IMBuffer() {
        return this.imBuffer;
    }

    code() {
        return this.compiledCode;
    }

    ast() {
        return JSON.stringify(this.tokens, null, indentationSpaces);
    }

    map() {
        return JSON.stringify(this.sourceMap);
    }

    prettifyMessage(/* Message */ aMessage) {
        var line = aMessage.messageForLine,
            message = "\n" + (line || "");

        // Handle if line does not end with a new line
        if (!message.endsWith("\n")) message += "\n";
        if (line) {
            // Add spaces all the way to the column with the error/warning and mark it with a '^'
            message += (new Array((aMessage.messageOnColumn || 0) + 1)).join(" ");
            message += (new Array(Math.min(1, line.length || 1) + 1)).join("^") + "\n";
        }
        message += (aMessage.messageType || "ERROR") + " line " + (aMessage.messageOnLine || aMessage.line) + " in " + this.URL + ":" + aMessage.messageOnLine + ": " + aMessage.message;

        return message;
    }

    error_message(errorMessage, node) {
        var pos = objjParser.getLineInfo(this.source, node.start),
            syntaxError = new SyntaxError(errorMessage);

        syntaxError.messageOnLine = pos.line;
        syntaxError.messageOnColumn = pos.column;
        syntaxError.path = this.URL;
        syntaxError.messageForNode = node;
        syntaxError.messageType = "ERROR";
        syntaxError.messageForLine = this.source.substring(pos.lineStart, pos.lineEnd);

        return syntaxError;
    }

    pushImport(url) {
        if (!ObjJAcornCompiler.importStack) ObjJAcornCompiler.importStack = [];  // This is used to keep track of imports. Each time the compiler imports a file the url is pushed here.

        ObjJAcornCompiler.importStack.push(url);
    }

    popImport() {
        ObjJAcornCompiler.importStack.pop();
    }

    compile(node, state, visitor) {
        function c(node, st, override) {
            if (typeof visitor[override || node.type] !== "function") {
                console.log(node.type)
                console.log(override)
                console.log(Object.keys(visitor));
            }
            visitor[override || node.type](node, st, c);
        }
        c(node, state);
    }

    compileWithFormat(node, state, visitor) {
        var lastNode, lastComment;
        function c(node, st, override) {
            var compiler = st.compiler,
                includeComments = compiler.includeComments,
                localLastNode = lastNode,
                sameNode = localLastNode === node;
            //console.log(override || node.type);
            lastNode = node;
            if (includeComments && !sameNode && node.commentsBefore && node.commentsBefore !== lastComment) {
                for (var i = 0; i < node.commentsBefore.length; i++)
                    compiler.jsBuffer.concat(node.commentsBefore[i]);
            }
            st.pushNode(node, override);
            var formatDescription = st.formatDescription();
            //console.log("formatDescription: " + JSON.stringify(formatDescription) + ", node.type: " + node.type + ", override: " + override);
            if (!sameNode && formatDescription && formatDescription.before)
                compiler.jsBuffer.concatFormat(formatDescription.before);
            visitor[override || node.type](node, st, c, formatDescription);
            if (!sameNode && formatDescription && formatDescription.after)
                compiler.jsBuffer.concatFormat(formatDescription.after);
            st.popNode();
            if (includeComments && !sameNode && node.commentsAfter) {
                for (var i = 0; i < node.commentsAfter.length; i++)
                    compiler.jsBuffer.concat(node.commentsAfter[i]);
                lastComment = node.commentsAfter;
            } else {
                lastComment = null;
            }
        }
        c(node, state);
    }

}

/*!
    This function is used to calculate the number of lines that is added when a 'new Function(...) call is used.
    This is used to make sure source maps are correct
    Currently Safari is adding one line and Chrome and Firefox is adding two lines.

    We calculate this by creating a function and counts the number of new lines at the top of the function
    The result is cached so we only need to make the calculation once.
 */
export function numberOfLinesAtTopOfFunction() {
    var f = new Function("x", "return x;");
    var fString = f.toString();
    var index = fString.indexOf("return x;");
    var firstPart = fString.substring(0, index);
    var numberOfLines = (firstPart.match(/\n/g) || []).length;

    ObjJAcornCompiler.numberOfLinesAtTopOfFunction = function () {
        return numberOfLines;
    }

    return numberOfLines;
}

ObjJAcornCompiler.methodDefsFromMethodList = function (/* Array */ methodList) {
    var methodSize = methodList.length,
        myMethods = Object.create(null);

    for (var i = 0; i < methodSize; i++) {
        var method = methodList[i],
            methodName = method_getName(method);

        myMethods[methodName] = new MethodDef(methodName, method.types);
    }

    return myMethods;
}


/*!
    Return a parsed option dictionary
 */
export function parseGccCompilerFlags(/* String */ compilerFlags) {
    var args = (compilerFlags || "").split(" "),
        count = args.length,
        objjcFlags = {};

    for (var index = 0; index < count; ++index) {
        var argument = args[index];

        if (argument.indexOf("-g") === 0)
            objjcFlags.includeMethodFunctionNames = true;
        else if (argument.indexOf("-O") === 0) {
            objjcFlags.compress = true; // This is not used in the compiler option dictionary but we add it here as it is also done if compiling from command line.
            // FIXME: currently we are sending in '-O2' when we want InlineMsgSend. Here we only check if it is '-O...'.
            // Maybe we should have some other option for this
            if (argument.length > 2)
                objjcFlags.inlineMsgSendFunctions = true;
        }
        //else if (argument.indexOf("-G") === 0)
        //objjcFlags |= ObjJAcornCompiler.Flags.Generate;
        else if (argument.indexOf("-T") === 0) {
            objjcFlags.includeIvarTypeSignatures = false;
            objjcFlags.includeMethodArgumentTypeSignatures = false;
        }
        else if (argument.indexOf("-S") === 0) {
            objjcFlags.sourceMap = true;
            objjcFlags.sourceMapIncludeSource = true;
        }
        else if (argument.indexOf("--include") === 0) {
            var includeUrl = args[++index],
                firstChar = includeUrl && includeUrl.charCodeAt(0);

            // Poor mans unquote
            if (firstChar === 34 || firstChar === 39) // '"', "'"
                includeUrl = includeUrl.substring(1, includeUrl.length - 1);

            (objjcFlags.includeFiles || (objjcFlags.includeFiles = [])).push(includeUrl);
        }
        else if (argument.indexOf("--inline-msg-send") === 0) {
            // This option is if you only want to inline message send functions
            objjcFlags.inlineMsgSendFunctions = true;
        }
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
                }*/
        else if (argument.indexOf("-D") === 0) {
            var macroDefinition = argument.substring(2);

            (objjcFlags.macros || (objjcFlags.macros = [])).push(macroDefinition);
        }
        else if (argument.indexOf("-W") === 0) {
            // TODO: Check if the warning name is a valid one. Now we just grab what is written and set/remove it.
            var isNo = argument.indexOf("no-", 2) === 2
            var warningName = argument.substring(isNo ? 5 : 2);
            var indexOfWarning = (objjcFlags.warnings || (objjcFlags.warnings = defaultOptions.warnings.slice())).findIndex(function (element) { return element.name === warningName });

            if (isNo) {
                if (indexOfWarning !== -1) {
                    // remove if it exists
                    objjcFlags.warnings.splice(indexOfWarning, 1);
                }
            } else {
                if (indexOfWarning === -1) {
                    // Add if it does not exists
                    var theWarning = AllWarnings.find(function (element) { return element.name === warningName });
                    if (theWarning) objjcFlags.warnings.push(theWarning);
                }
            }
        }
    }

    return objjcFlags;
}



