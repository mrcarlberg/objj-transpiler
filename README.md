ObjJAcornCompiler
=================

A tiny, fast JavaScript and/or [Objective-J][objj] compiler with built in preprocessor. Written in JavaScript.

[objj]: http://www.cappuccino-project.org/learn/objective-j.html

It uses a parser extended from the [Acorn][objj-acorn] JavaScript parser by Marijn Haverbeke.

[objj-acorn]: https://github.com/mrcarlberg/acorn

## Format generated code

The generated code can be formatted by providing a format description file with the '--formatDescription' option
There are some example files in the format folder.

It can also include comments with the '--includeComments' option.

## Beautifier

Objective-J is a superset of Javascript. If it compiles a pure Javascript file it will generate the same code back again.
This allows the compiler to be used as a beautifier for Javascript.

## Preprocessor

The parser has a built in C like preprocessor.

Example:
```c
#define MAX(x, y) (x > y ? x : y)
var m1 = MAX(a, b);
var m2 = MAX(14, 20);
```
Will be compiled to:
```c
var m1 = a > b ? a : b;
var m2 = 14 > 20 ? 14 : 20;
```
For more info see http://www.cappuccino-project.org/blog/2013/05/the-new-objective-j-2-0-compiler.html

## How to use

usage: objjc infile [--ecma3|--ecma5] [--strict-semicolons] [--track-comments]
        [--include-comments] [--include-comment-line-break] [(-o | --output) <path>
        [--formatter <path>]  [--indent-tab] [--indent-width <n>] [--indent-string <string>]
        [--track-spaces] [--track-locations] [--no-objj] [--no-preprocess] [--old-safari-bug]
        [--no-debug-symbols] [--no-type-signatures] [--generate-objj]
        [--source-map] [--ast] [--no-code]
        [-Dmacro[([p1, p2, ...])][=definition]] [--silent] [--help]


 	--ecma3 and --ecma5:		Indicates the ECMAScript version to parse. Must be either 3 or 5. This influences support for strict mode, the set of reserved words, and support for getters and setter.
 	--strict-semicolons:		The parser demands semicolons between statements.
 	the parser will not allow
    --no-allow-trailing-commas:	Don't allow trailing commas in array and object literals.
    --track-comments:
    --include-comments:
	--include-comment-line-break:

Objective-J limitations:
It can't compile Objective-J code that depends on other Objective-J files. The Objective-J load and
runtime is needed for this. But it will work as long as you declare any superclass in the same file.
This will be fixed when the Objective-J load and runtime will be a node module