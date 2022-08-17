import { ObjJAcornCompiler } from "./compiler";

// This might not be used
export function compileToExecutable(/*String*/ aString, /*CFURL*/ aURL, options) {
    exports.currentCompileFile = aURL;
    return new ObjJAcornCompiler(aString, aURL, options).executable();
}

export function compileToIMBuffer(/*String*/ aString, /*CFURL*/ aURL, options) {
    return new ObjJAcornCompiler(aString, aURL, options).IMBuffer();
}

export function compile(/*String*/ aString, /*CFURL*/ aURL, options) {
    return new ObjJAcornCompiler(aString, aURL, options);
}

export function compileFileDependencies(/*String*/ aString, /*CFURL*/ aURL, options) {
    exports.currentCompileFile = aURL;
    (options || (options = {})).pass = 1;
    return new ObjJAcornCompiler(aString, aURL, options);
}