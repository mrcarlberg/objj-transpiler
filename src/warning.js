import * as objjParser from "objj-parser";

export class GlobalVariableMaybeWarning {

    constructor(/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code) {
        this.message = createMessage(aMessage, node, code);
        this.node = node;
    }

    checkIfWarning = function(/* Scope */ st) {
        var identifier = this.node.name;
        return !st.getLvar(identifier) && typeof global[identifier] === "undefined" && (typeof window === 'undefined' || typeof window[identifier] === "undefined") && !st.compiler.getClassDef(identifier);
    }

    isEqualTo = function(/* GlobalVariableMaybeWarning */ aWarning) {
        if (this.message.message !== aWarning.message.message) return false;
        if (this.node.start !== aWarning.node.start) return false;
        if (this.node.end !== aWarning.node.end) return false;

        return true;
    }
}

export let warningUnusedButSetVariable = {name: "unused-but-set-variable"};
export let warningShadowIvar = {name: "shadow-ivar"}
export let warningCreateGlobalInsideFunctionOrMethod = {name: "create-global-inside-function-or-method"};
export let warningUnknownClassOrGlobal = {name: "unknown-class-or-global"};
export let warningUnknownIvarType = {name: "unknown-ivar-type"};

var AllWarnings = [warningUnusedButSetVariable, warningShadowIvar, warningCreateGlobalInsideFunctionOrMethod, warningUnknownClassOrGlobal, warningUnknownIvarType];

export function createMessage(/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code) {
    var message = objjParser.getLineInfo(code, node.start);

    message.message = aMessage;
    // As a SyntaxError object can't change the property 'line' we also set the property 'messageOnLine'
    message.messageOnLine = message.line;
    message.messageOnColumn = message.column;
    message.messageForNode = node;
    message.messageType = "WARNING";
    message.messageForLine = code.substring(message.lineStart, message.lineEnd);

    return message;
}