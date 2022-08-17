import { warningUnusedButSetVariable, warningShadowIvar, warningCreateGlobalInsideFunctionOrMethod, warningUnknownClassOrGlobal, warningUnknownIvarType } from "./warning.js";

// A optional argument can be given to further configure
// the compiler. These options are recognized:

export const defaultOptions = {

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
    indentationType: " ",

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
    macros: null,

};

// We copy the options to a new object as we don't want to mess up incoming options when we start compiling.
export function setupOptions(opts) {
    var options = Object.create(null);
    for (var opt in defaultOptions) {
        if (opts && Object.prototype.hasOwnProperty.call(opts, opt)) {
            var incomingOpt = opts[opt];
            options[opt] = typeof incomingOpt === 'function' ? incomingOpt() : incomingOpt;
        } else if (defaultOptions.hasOwnProperty(opt)) {
            var defaultOpt = defaultOptions[opt];
            options[opt] = typeof defaultOpt === 'function' ? defaultOpt() : defaultOpt;
        }
    }
    return options;
}