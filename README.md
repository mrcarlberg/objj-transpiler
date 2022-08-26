# ObjJAcornCompiler

A tiny, fast JavaScript and/or [Objective-J][objj] transpiler with built in preprocessor. Written in JavaScript.

[objj]: https://www.cappuccino.dev/learn/objective-j.html

It uses a parser extended from the [Acorn][objj-transpiler] JavaScript parser by Marijn Haverbeke.

[objj-transpiler]: https://github.com/cappuccino/objj-transpiler


## Preprocessor

The parser has a built in C like preprocessor.

Example:
```c++
#define MAX(x, y) (x > y ? x : y)
var m1 = MAX(a, b);
var m2 = MAX(14, 20);
```
Will be compiled to:
```c++
var m1 = a > b ? a : b;
var m2 = 14 > 20 ? 14 : 20;
```
For more info see [this][blogpost] blogpost on the Cappuccino website.

[blogpost]: https://www.cappuccino.dev/blog/2013/05/the-new-objective-j-2-0-compiler.html

## Usage


```
    --module                        Set the source type to module instead of script in
                                    the parser.

    --ecma5, --ecma8, --latest      Sets the set version of ECMAScript used be the parser.

    --loose                         Sets the parser to use loose mode.

    --preserve-paren                Tells the parser to preserve parentheses, even if
                                    unnecessary.

    --strict-semicolons             ???

    --no-allow-trailing-commas      ???

    --track-comments                ???

    --include-comment-line-break    ???

    --include-comments              ???

    --track-spaces                  ???

    --track-locations               ???

    --no-objj                       Turns off the parsing of Objective-J.

    --no-preprocess                 Turns off the parsing of preprocessor directives.

    --silent                        ???

    --old-safari-bug                ???

    --no-code                       ???

    --ast                           Generates the intermediate AST as a JSON file.

    --source-map                    ???

    --no-debug-symbols              ???

    --no-type-signatures            ???

    --no-inline-msgsend             ???

    --indent-width                  ???

    --indent-string                 ???

    --indent-tab                    ???

    --output, -o

    -D                              ???

    --help                          ???

    -                               ???
````

## Limitations
It can't compile Objective-J code that depends on other Objective-J files. The Objective-J load and
runtime is needed for this. But it will work as long as you declare any superclass in the same file.