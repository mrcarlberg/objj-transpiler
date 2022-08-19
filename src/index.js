import { ObjJAcornCompiler } from "./compiler";

import { defaultOptions } from "./options";

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