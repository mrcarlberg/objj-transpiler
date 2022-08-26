if (typeof exports !== "undefined") {
  var test = require("./driver.js").test
  var testFail = require("./driver.js").testFail
}

// Preprocessor test

test("#define martin\n#ifdef carlberg\nvar b;\n#else\n#ifdef martin\nthis\n#else\nvar i;\n#endif\n#endif\n", {
  type: "Program",
  start: 0,
  end: 90,
  loc: {
    start: {
      line: 1,
      column: 0
    },
    end: {
      line: 11,
      column: 0
    }
  },
  body: [
    {
      type: "ExpressionStatement",
      start: 58,
      end: 62,
      loc: {
        start: {
          line: 6,
          column: 0
        },
        end: {
          line: 6,
          column: 4
        },
      },
      expression: {
        type: "ThisExpression",
        start: 58,
        end: 62,
        loc: {
          start: {
            line: 6,
            column: 0
          },
          end: {
            line: 6,
            column: 4
          },
        }
      }
    }
  ]
}, {
  locations: true,
  preprocess: true
});

// Preprocessor tests based on the GCC 4.0 Preprocessor User Guide
// http://gcc.gnu.org/onlinedocs/cpp/index.html

// 1.4 The preprocessing language

// #define may be indented
test("    #define FOO 7\nfoo = FOO;\n", {
  type: "Program",
  start: 0,
  end: 29,
  body: [
    {
      type: "ExpressionStatement",
      start: 18,
      end: 28,
      expression: {
        type: "AssignmentExpression",
        start: 18,
        end: 17,
        operator: "=",
        left: {
          type: "Identifier",
          start: 18,
          end: 21,
          name: "foo"
        },
        right: {
          type: "Literal",
          start: 16,
          end: 17,
          value: 7,
          raw: "7"
        }
      }
    }
  ]
}, {
  preprocess: true
});

// # may be separated from directive by whitespace
test("# /* comment */ define FOO 13\nfoo = FOO;\n", {
  type: "Program",
  start: 0,
  end: 41,
  body: [
    {
      type: "ExpressionStatement",
      start: 30,
      end: 40,
      expression: {
        type: "AssignmentExpression",
        start: 30,
        end: 29,
        operator: "=",
        left: {
          type: "Identifier",
          start: 30,
          end: 33,
          name: "foo"
        },
        right: {
          type: "Literal",
          start: 27,
          end: 29,
          value: 13,
          raw: "13"
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Preprocessor directives must be the first token on a line
testFail("\"foo\"; #define FOO 13\nfoo = FOO;\n",
         "Preprocessor directives may only be used at the beginning of a line (1:7)",
{
  preprocess: true
});

// Comments may be used anywhere within a macro
// This test is turned off as we don't track comments like this currently
//test("#define COMMENTS(/* an arg */ arg) /* one */ arg /* two */ * 7 /*\nthree */ + 1\nx = /* before */ COMMENTS(13) /* after */;\n", {
//   type: "Program",
//   start: 79,
//   end: 121,
//   body: [
//     {
//       type: "ExpressionStatement",
//       start: 79,
//       end: 121,
//       expression: {
//         type: "AssignmentExpression",
//         start: 79,
//         end: 78,
//         operator: "=",
//         left: {
//           type: "Identifier",
//           start: 79,
//           end: 80,
//           name: "x"
//         },
//         right: {
//           type: "BinaryExpression",
//           start: 105,
//           end: 78,
//           commentsBefore: [
//             "/* before */"
//           ],
//           left: {
//             type: "BinaryExpression",
//             start: 105,
//             end: 62,
//             left: {
//               type: "Literal",
//               start: 105,
//               end: 107,
//               value: 13,
//               raw: "13",
//               commentsAfter: [
//                 "/* two */"
//               ]
//             },
//             operator: "*",
//             right: {
//               type: "Literal",
//               start: 61,
//               end: 62,
//               value: 7,
//               raw: "7"
//             },
//             commentsAfter: [
//               "/*\nthree */"
//             ]
//           },
//           operator: "+",
//           right: {
//             type: "Literal",
//             start: 77,
//             end: 78,
//             value: 1,
//             raw: "1"
//           }
//         },
//         commentsAfter: [
//           "/* after */"
//         ]
//       }
//     }
//   ]
// }, {
//   preprocess: true,
//   trackComments: true
// });

// Preprocessor directives do not affect comment/space tracking
/* test("function test()\n{\n    // Comments are aggregated\n    #define FOO 7\n    // even if there are\n    #undef FOO\n    // preprocessor directives\n    #define FOO 13\n    // in between.\n    var x = FOO;\n    // These comments\n    #define BAR 7\n    // will appear after.\n    #undef BAR\n    // I hope!\n    x = BAR;\n}\n", {
  type: "Program",
  start: 0,
  end: 304,
  body: [
    {
      type: "FunctionDeclaration",
      start: 0,
      end: 303,
      id: {
        type: "Identifier",
        start: 9,
        end: 13,
        name: "test"
      },
      params: [],
      body: {
        type: "BlockStatement",
        start: 16,
        end: 303,
        body: [
          {
            type: "VariableDeclaration",
            start: 180,
            end: 156,
            commentsBefore: [
              "// Comments are aggregated",
              "// even if there are",
              "// preprocessor directives",
              "// in between."
            ],
            spacesBefore: [
              "\n    ",
              "\n    ",
              "\n    ",
              "\n    "
            ],
            declarations: [
              {
                type: "VariableDeclarator",
                start: 184,
                end: 156,
                id: {
                  type: "Identifier",
                  start: 184,
                  end: 185,
                  name: "x"
                },
                init: {
                  type: "Literal",
                  start: 154,
                  end: 156,
                  value: 13,
                  raw: "13"
                }
              }
            ],
            kind: "var"
          },
          {
            type: "ExpressionStatement",
            start: 293,
            end: 301,
            commentsBefore: [
              "// These comments",
              "// will appear after.",
              "// I hope!"
            ],
            spacesBefore: [
              "\n    ",
              "\n    ",
              "\n    "
            ],
            expression: {
              type: "AssignmentExpression",
              start: 293,
              end: 300,
              operator: "=",
              left: {
                type: "Identifier",
                start: 293,
                end: 294,
                name: "x"
              },
              right: {
                type: "Identifier",
                start: 297,
                end: 300,
                name: "BAR"
              }
            }
          }
        ]
      }
    }
  ]
}, {
  preprocess: true,
  trackComments: true,
  trackSpaces: true
}); */

/* test("function test()\n{\n    var y = 0;\n    // Comments are aggregated\n    #define FOO 7\n    // even if there are\n    #undef FOO\n    // preprocessor directives\n    #define FOO 13\n    // in between.\n    var x = FOO;\n}\n", {
  type: "Program",
  start: 0,
  end: 210,
  body: [
    {
      type: "FunctionDeclaration",
      start: 0,
      end: 209,
      id: {
        type: "Identifier",
        start: 9,
        end: 13,
        name: "test"
      },
      params: [],
      body: {
        type: "BlockStatement",
        start: 16,
        end: 209,
        body: [
          {
            type: "VariableDeclaration",
            start: 22,
            end: 31,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 26,
                end: 31,
                id: {
                  type: "Identifier",
                  start: 26,
                  end: 27,
                  name: "y"
                },
                init: {
                  type: "Literal",
                  start: 30,
                  end: 31,
                  value: 0,
                  raw: "0"
                }
              }
            ],
            kind: "var"
          },
          {
            type: "VariableDeclaration",
            start: 195,
            end: 171,
            commentsBefore: [
              "// Comments are aggregated",
              "// even if there are",
              "// preprocessor directives",
              "// in between."
            ],
            declarations: [
              {
                type: "VariableDeclarator",
                start: 199,
                end: 171,
                id: {
                  type: "Identifier",
                  start: 199,
                  end: 200,
                  name: "x"
                },
                init: {
                  type: "Literal",
                  start: 169,
                  end: 171,
                  value: 13,
                  raw: "13"
                }
              }
            ],
            kind: "var"
          }
        ]
      }
    }
  ]
}, {
  preprocess: true,
  trackComments: true
}); */

// Macros may be passed in options.macros, either as macro objects or text definitions
test("x = FOO;\n", {
  type: "Program",
  start: 0,
  end: 9,
  body: [
    {
      type: "ExpressionStatement",
      start: 0,
      end: 8,
      expression: {
        type: "AssignmentExpression",
        start: 0,
        end: 5,
        operator: "=",
        left: {
          type: "Identifier",
          start: 0,
          end: 1,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 4,
          end: 5,
          value: 7,
          raw: "7"
        }
      }
    }
  ]
}, {
  preprocess: true,
  macros: ["FOO=7"]
});

// 3.1 Object-like macros

// Macros may span multiple lines
test("#define NUMBERS 1, \\\n                2, \\\n                3\nx = [NUMBERS];\n", {
  type: "Program",
  start: 0,
  end: 75,
  body: [
    {
      type: "ExpressionStatement",
      start: 60,
      end: 74,
      expression: {
        type: "AssignmentExpression",
        start: 60,
        end: 73,
        operator: "=",
        left: {
          type: "Identifier",
          start: 60,
          end: 61,
          name: "x"
        },
        right: {
          type: "ArrayExpression",
          start: 64,
          end: 73,
          elements: [
            {
              type: "Literal",
              start: 16,
              end: 17,
              value: 1,
              raw: "1"
            },
            {
              type: "Literal",
              start: 37,
              end: 38,
              value: 2,
              raw: "2"
            },
            {
              type: "Literal",
              start: 58,
              end: 59,
              value: 3,
              raw: "3"
            }
          ]
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Macros only take effect from point of definition
test("foo = X;\n#define X 4\nbar = X;\n", {
  type: "Program",
  start: 0,
  end: 30,
  body: [
    {
      type: "ExpressionStatement",
      start: 0,
      end: 8,
      expression: {
        type: "AssignmentExpression",
        start: 0,
        end: 7,
        operator: "=",
        left: {
          type: "Identifier",
          start: 0,
          end: 3,
          name: "foo"
        },
        right: {
          type: "Identifier",
          start: 6,
          end: 7,
          name: "X"
        }
      }
    },
    {
      type: "ExpressionStatement",
      start: 21,
      end: 29,
      expression: {
        type: "AssignmentExpression",
        start: 21,
        end: 20,
        operator: "=",
        left: {
          type: "Identifier",
          start: 21,
          end: 24,
          name: "bar"
        },
        right: {
          type: "Literal",
          start: 19,
          end: 20,
          value: 4,
          raw: "4"
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Macros are evaluated when expanded
test("#define TABLESIZE BUFSIZE\n#define BUFSIZE 1024\nfoo = TABLESIZE;\n", {
  type: "Program",
  start: 0,
  end: 64,
  body: [
    {
      type: "ExpressionStatement",
      start: 47,
      end: 63,
      expression: {
        type: "AssignmentExpression",
        start: 47,
        end: 46,
        operator: "=",
        left: {
          type: "Identifier",
          start: 47,
          end: 50,
          name: "foo"
        },
        right: {
          type: "Literal",
          start: 42,
          end: 46,
          value: 1024,
          raw: "1024"
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Macros can be redefined
test("#define BUFSIZE 1020\n#define TABLESIZE BUFSIZE\nfoo = TABLESIZE;\n#undef BUFSIZE\n#define BUFSIZE 37\nfoo = TABLESIZE;\n", {
  type: "Program",
  start: 0,
  end: 115,
  body: [
    {
      type: "ExpressionStatement",
      start: 47,
      end: 63,
      expression: {
        type: "AssignmentExpression",
        start: 47,
        end: 20,
        operator: "=",
        left: {
          type: "Identifier",
          start: 47,
          end: 50,
          name: "foo"
        },
        right: {
          type: "Literal",
          start: 16,
          end: 20,
          value: 1020,
          raw: "1020"
        }
      }
    },
    {
      type: "ExpressionStatement",
      start: 98,
      end: 114,
      expression: {
        type: "AssignmentExpression",
        start: 98,
        end: 97,
        operator: "=",
        left: {
          type: "Identifier",
          start: 98,
          end: 101,
          name: "foo"
        },
        right: {
          type: "Literal",
          start: 95,
          end: 97,
          value: 37,
          raw: "37"
        }
      }
    }
  ]
}, {
  preprocess: true
});

// 3.2 Function-like Macros

// Macros can be called like functions
test("#define lang_init()  c_init()\nlang_init();\n", {
  type: "Program",
  start: 0,
  end: 43,
  body: [
    {
      type: "ExpressionStatement",
      start: 21,
      end: 42,
      expression: {
        type: "CallExpression",
        start: 21,
        end: 29,
        callee: {
          type: "Identifier",
          start: 21,
          end: 27,
          name: "c_init"
        },
        arguments: []
      }
    }
  ]
}, {
  preprocess: true
});

// Function macros used without args are not expanded
test("function foobar() { console.log(\"out of line\"); }\n#define foobar()  console.log(\"inline\");\nfoobar();\nfuncptr = foobar;\n", {
  type: "Program",
  start: 0,
  end: 119,
  body: [
    {
      type: "FunctionDeclaration",
      start: 0,
      end: 49,
      id: {
        type: "Identifier",
        start: 9,
        end: 15,
        name: "foobar"
      },
      params: [],
      body: {
        type: "BlockStatement",
        start: 18,
        end: 49,
        body: [
          {
            type: "ExpressionStatement",
            start: 20,
            end: 47,
            expression: {
              type: "CallExpression",
              start: 20,
              end: 46,
              callee: {
                type: "MemberExpression",
                start: 20,
                end: 31,
                object: {
                  type: "Identifier",
                  start: 20,
                  end: 27,
                  name: "console"
                },
                property: {
                  type: "Identifier",
                  start: 28,
                  end: 31,
                  name: "log"
                },
                computed: false
              },
              arguments: [
                {
                  type: "Literal",
                  start: 32,
                  end: 45,
                  value: "out of line",
                  raw: "\"out of line\""
                }
              ]
            }
          }
        ]
      }
    },
    {
      type: "ExpressionStatement",
      start: 68,
      end: 90,
      expression: {
        type: "CallExpression",
        start: 68,
        end: 89,
        callee: {
          type: "MemberExpression",
          start: 68,
          end: 79,
          object: {
            type: "Identifier",
            start: 68,
            end: 75,
            name: "console"
          },
          property: {
            type: "Identifier",
            start: 76,
            end: 79,
            name: "log"
          },
          computed: false
        },
        arguments: [
          {
            type: "Literal",
            start: 80,
            end: 88,
            value: "inline",
            raw: "\"inline\""
          }
        ]
      }
    },
    {
      type: "EmptyStatement",
      start: 99,
      end: 100
    },
    {
      type: "ExpressionStatement",
      start: 101,
      end: 118,
      expression: {
        type: "AssignmentExpression",
        start: 101,
        end: 117,
        operator: "=",
        left: {
          type: "Identifier",
          start: 101,
          end: 108,
          name: "funcptr"
        },
        right: {
          type: "Identifier",
          start: 111,
          end: 117,
          name: "foobar"
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Macro parameters must immediately follow the name
test("#define lang_init (arg);    c_init()\nlang_init();\n", {
  type: "Program",
  start: 0,
  end: 50,
  body: [
    {
      type: "ExpressionStatement",
      start: 18,
      end: 24,
      expression: {
        type: "Identifier",
        start: 19,
        end: 22,
        name: "arg"
      }
    },
    {
      type: "ExpressionStatement",
      start: 28,
      end: 49,
      expression: {
        type: "CallExpression",
        start: 28,
        end: 48,
        callee: {
          type: "CallExpression",
          start: 28,
          end: 36,
          callee: {
            type: "Identifier",
            start: 28,
            end: 34,
            name: "c_init"
          },
          arguments: []
        },
        arguments: []
      }
    }
  ]
}, {
  preprocess: true
});

// 3.3 Macro Arguments

// Macros can take arguments
test("#define min(X, Y)  ((X) < (Y) ? (X) : (Y))\nx = min(a, b);\ny = min(1, 2);\nz = min(a + 28, p);\n", {
  type: "Program",
  start: 0,
  end: 93,
  body: [
    {
      type: "ExpressionStatement",
      start: 43,
      end: 57,
      expression: {
        type: "AssignmentExpression",
        start: 43,
        end: 42,
        operator: "=",
        left: {
          type: "Identifier",
          start: 43,
          end: 44,
          name: "x"
        },
        right: {
          type: "ConditionalExpression",
          start: 20,
          end: 41,
          test: {
            type: "BinaryExpression",
            start: 20,
            end: 29,
            left: {
              type: "Identifier",
              start: 51,
              end: 52,
              name: "a"
            },
            operator: "<",
            right: {
              type: "Identifier",
              start: 54,
              end: 55,
              name: "b"
            }
          },
          consequent: {
            type: "Identifier",
            start: 51,
            end: 52,
            name: "a"
          },
          alternate: {
            type: "Identifier",
            start: 54,
            end: 55,
            name: "b"
          }
        }
      }
    },
    {
      type: "ExpressionStatement",
      start: 58,
      end: 72,
      expression: {
        type: "AssignmentExpression",
        start: 58,
        end: 42,
        operator: "=",
        left: {
          type: "Identifier",
          start: 58,
          end: 59,
          name: "y"
        },
        right: {
          type: "ConditionalExpression",
          start: 20,
          end: 41,
          test: {
            type: "BinaryExpression",
            start: 20,
            end: 29,
            left: {
              type: "Literal",
              start: 66,
              end: 67,
              value: 1,
              raw: "1"
            },
            operator: "<",
            right: {
              type: "Literal",
              start: 69,
              end: 70,
              value: 2,
              raw: "2"
            }
          },
          consequent: {
            type: "Literal",
            start: 66,
            end: 67,
            value: 1,
            raw: "1"
          },
          alternate: {
            type: "Literal",
            start: 69,
            end: 70,
            value: 2,
            raw: "2"
          }
        }
      }
    },
    {
      type: "ExpressionStatement",
      start: 73,
      end: 92,
      expression: {
        type: "AssignmentExpression",
        start: 73,
        end: 42,
        operator: "=",
        left: {
          type: "Identifier",
          start: 73,
          end: 74,
          name: "z"
        },
        right: {
          type: "ConditionalExpression",
          start: 20,
          end: 41,
          test: {
            type: "BinaryExpression",
            start: 20,
            end: 29,
            left: {
              type: "BinaryExpression",
              start: 81,
              end: 87,
              left: {
                type: "Identifier",
                start: 81,
                end: 82,
                name: "a"
              },
              operator: "+",
              right: {
                type: "Literal",
                start: 85,
                end: 87,
                value: 28,
                raw: "28"
              }
            },
            operator: "<",
            right: {
              type: "Identifier",
              start: 89,
              end: 90,
              name: "p"
            }
          },
          consequent: {
            type: "BinaryExpression",
            start: 81,
            end: 87,
            left: {
              type: "Identifier",
              start: 81,
              end: 82,
              name: "a"
            },
            operator: "+",
            right: {
              type: "Literal",
              start: 85,
              end: 87,
              value: 28,
              raw: "28"
            }
          },
          alternate: {
            type: "Identifier",
            start: 89,
            end: 90,
            name: "p"
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Leading and trailing whitespace is trimmed, whitespace between tokens is reduced to single space
test("#define min(X, Y)  ((X) < (Y) ? (X) : (Y))\nx = min(  a   +   7,\n         b\n         -\n         13  );\n", {
  type: "Program",
  start: 0,
  end: 102,
  body: [
    {
      type: "ExpressionStatement",
      start: 43,
      end: 101,
      expression: {
        type: "AssignmentExpression",
        start: 43,
        end: 42,
        operator: "=",
        left: {
          type: "Identifier",
          start: 43,
          end: 44,
          name: "x"
        },
        right: {
          type: "ConditionalExpression",
          start: 20,
          end: 41,
          test: {
            type: "BinaryExpression",
            start: 20,
            end: 29,
            left: {
              type: "BinaryExpression",
              start: 53,
              end: 62,
              left: {
                type: "Identifier",
                start: 53,
                end: 54,
                name: "a"
              },
              operator: "+",
              right: {
                type: "Literal",
                start: 61,
                end: 62,
                value: 7,
                raw: "7"
              }
            },
            operator: "<",
            right: {
              type: "BinaryExpression",
              start: 73,
              end: 97,
              left: {
                type: "Identifier",
                start: 73,
                end: 74,
                name: "b"
              },
              operator: "-",
              right: {
                type: "Literal",
                start: 95,
                end: 97,
                value: 13,
                raw: "13"
              }
            }
          },
          consequent: {
            type: "BinaryExpression",
            start: 53,
            end: 62,
            left: {
              type: "Identifier",
              start: 53,
              end: 54,
              name: "a"
            },
            operator: "+",
            right: {
              type: "Literal",
              start: 61,
              end: 62,
              value: 7,
              raw: "7"
            }
          },
          alternate: {
            type: "BinaryExpression",
            start: 73,
            end: 97,
            left: {
              type: "Identifier",
              start: 73,
              end: 74,
              name: "b"
            },
            operator: "-",
            right: {
              type: "Literal",
              start: 95,
              end: 97,
              value: 13,
              raw: "13"
            }
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Square brackets do not have to balance
test("#define square_brackets(arg1, arg2)  arg1 ## arg2\na = square_brackets([x, y]);\n", {
  type: "Program",
  start: 0,
  end: 79,
  body: [
    {
      type: "ExpressionStatement",
      start: 50,
      end: 78,
      expression: {
        type: "AssignmentExpression",
        start: 50,
        end: 76,
        operator: "=",
        left: {
          type: "Identifier",
          start: 50,
          end: 51,
          name: "a"
        },
        right: {
          type: "ArrayExpression",
          start: 70,
          end: 76,
          elements: [
            {
              type: "Identifier",
              start: 71,
              end: 73,
              name: "xy"
            }
          ]
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Commas may be within arguments
test("#define comma(arg)  arg;\ncomma((x = 0, y = 1));\n", {
  type: "Program",
  start: 0,
  end: 48,
  body: [
    {
      type: "ExpressionStatement",
      start: 31,
      end: 24,
      expression: {
        type: "SequenceExpression",
        start: 32,
        end: 44,
        expressions: [
          {
            type: "AssignmentExpression",
            start: 32,
            end: 37,
            operator: "=",
            left: {
              type: "Identifier",
              start: 32,
              end: 33,
              name: "x"
            },
            right: {
              type: "Literal",
              start: 36,
              end: 37,
              value: 0,
              raw: "0"
            }
          },
          {
            type: "AssignmentExpression",
            start: 39,
            end: 44,
            operator: "=",
            left: {
              type: "Identifier",
              start: 39,
              end: 40,
              name: "y"
            },
            right: {
              type: "Literal",
              start: 43,
              end: 44,
              value: 1,
              raw: "1"
            }
          }
        ]
      }
    },
    {
      type: "EmptyStatement",
      start: 46,
      end: 47
    }
  ]
}, {
  preprocess: true
});

// Arguments are macro-expanded before substitution
test("#define DOUBLE(arg)  (arg) * 2\nx = min(DOUBLE(a), 10);\n", {
  type: "Program",
  start: 0,
  end: 55,
  body: [
    {
      type: "ExpressionStatement",
      start: 31,
      end: 54,
      expression: {
        type: "AssignmentExpression",
        start: 31,
        end: 53,
        operator: "=",
        left: {
          type: "Identifier",
          start: 31,
          end: 32,
          name: "x"
        },
        right: {
          type: "CallExpression",
          start: 35,
          end: 53,
          callee: {
            type: "Identifier",
            start: 35,
            end: 38,
            name: "min"
          },
          arguments: [
            {
              type: "BinaryExpression",
              start: 21,
              end: 30,
              left: {
                type: "Identifier",
                start: 46,
                end: 47,
                name: "a"
              },
              operator: "*",
              right: {
                type: "Literal",
                start: 29,
                end: 30,
                value: 2,
                raw: "2"
              }
            },
            {
              type: "Literal",
              start: 50,
              end: 52,
              value: 10,
              raw: "10"
            }
          ]
        }
      }
    }
  ]
}, {
  preprocess: true
});

// After substitution, the complete text is scanned again for macros
// to expand, including the arguments.

// #define DOUBLE(arg)  (arg) * 2
// #define QUADRUPLE(arg)  DOUBLE(arg) * 2
// x = QUADRUPLE(7);
// ==> x = DOUBLE(7) * 2;
// x = 7 * 2 * 2;

// #define paste_arg(arg1, arg2)  arg1 ## arg2
// x = paste_arg(QUAD, RUPLE(7));
// ==> x = QUAD ## RUPLE(7);
// ==> x = QUADRUPLE(7);
// ==> x = DOUBLE(7) * 2;
// x = 7 * 2 * 2;
// FIXME: The literal 7 node with start 153 and end 154 start at the R in RUPLE(7). Should be at 159.
test("#define DOUBLE(arg)  (arg) * 2\n#define QUADRUPLE(arg)  DOUBLE(arg) * 2\nx = QUADRUPLE(7);\n#define paste_arg(arg1, arg2)  arg1 ## arg2\nx = paste_arg(QUAD, RUPLE(7));\n", {
  type: "Program",
  start: 0,
  end: 164,
  body: [
    {
      type: "ExpressionStatement",
      start: 71,
      end: 88,
      expression: {
        type: "AssignmentExpression",
        start: 71,
        end: 70,
        operator: "=",
        left: {
          type: "Identifier",
          start: 71,
          end: 72,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 21,
          end: 70,
          left: {
            type: "BinaryExpression",
            start: 21,
            end: 30,
            left: {
              type: "Literal",
              start: 85,
              end: 86,
              value: 7,
              raw: "7"
            },
            operator: "*",
            right: {
              type: "Literal",
              start: 29,
              end: 30,
              value: 2,
              raw: "2"
            }
          },
          operator: "*",
          right: {
            type: "Literal",
            start: 69,
            end: 70,
            value: 2,
            raw: "2"
          }
        }
      }
    },
    {
      type: "ExpressionStatement",
      start: 133,
      end: 163,
      expression: {
        type: "AssignmentExpression",
        start: 133,
        end: 70,
        operator: "=",
        left: {
          type: "Identifier",
          start: 133,
          end: 134,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 21,
          end: 70,
          left: {
            type: "BinaryExpression",
            start: 21,
            end: 30,
            left: {
              type: "Literal",
              start: 153,
              end: 154,
              value: 7,
              raw: "7"
            },
            operator: "*",
            right: {
              type: "Literal",
              start: 29,
              end: 30,
              value: 2,
              raw: "2"
            }
          },
          operator: "*",
          right: {
            type: "Literal",
            start: 69,
            end: 70,
            value: 2,
            raw: "2"
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Arguments may be empty
test("#define ARGS(arg, arg2)  arg arg2\nARGS(,);\nARGS(, 2);\nARGS(1,);\n", {
  type: "Program",
  start: 0,
  end: 64,
  body: [
    {
      type: "EmptyStatement",
      start: 41,
      end: 42
    },
    {
      type: "ExpressionStatement",
      start: 50,
      end: 53,
      expression: {
        type: "Literal",
        start: 50,
        end: 51,
        value: 2,
        raw: "2"
      }
    },
    {
      type: "ExpressionStatement",
      start: 59,
      end: 63,
      expression: {
        type: "Literal",
        start: 59,
        end: 60,
        value: 1,
        raw: "1"
      }
    }
  ]
}, {
  preprocess: true
});

// Macro parameters appearing inside string literals are not replaced by their corresponding actual arguments
test("#define literal(arg)  arg; \"arg\"\nliteral(test);\n", {
  type: "Program",
  start: 0,
  end: 48,
  body: [
    {
      type: "ExpressionStatement",
      start: 41,
      end: 26,
      expression: {
        type: "Identifier",
        start: 41,
        end: 45,
        name: "test"
      }
    },
    {
      type: "ExpressionStatement",
      start: 27,
      end: 47,
      expression: {
        type: "Literal",
        start: 27,
        end: 32,
        value: "arg",
        raw: "\"arg\""
      }
    }
  ]
}, {
  preprocess: true
});

// 3.4 Stringification

// The preprocessor backslash-escapes the quotes surrounding embedded string constants,
// and all backslashes within string and character constants
test("#define stringify(arg)  #arg\nx = stringify(p = \"foo\\n\");\nx = stringify(p = 'foo\\n');\n", {
  type: "Program",
  start: 0,
  end: 85,
  body: [
    {
      type: "ExpressionStatement",
      start: 29,
      end: 56,
      expression: {
        type: "AssignmentExpression",
        start: 29,
        end: 59,
        operator: "=",
        left: {
          type: "Identifier",
          start: 29,
          end: 30,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 43,
          end: 59,
          value: "p = \"foo\\n\"",
          raw: "\"p = \\\"foo\\\\n\\\"\""
        }
      }
    },
    {
      type: "ExpressionStatement",
      start: 57,
      end: 84,
      expression: {
        type: "AssignmentExpression",
        start: 57,
        end: 85,
        operator: "=",
        left: {
          type: "Identifier",
          start: 57,
          end: 58,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 71,
          end: 85,
          value: "p = 'foo\\n'",
          raw: "\"p = 'foo\\\\n'\""
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Backslashes that are not inside string or character constants are not duplicated
// "foo bar" has a tab between the words, which is stringified to "\t".
test("#define stringify(arg)  #arg\nx = stringify(\"foo\tbar\");\n", {
  type: "Program",
  start: 0,
  end: 55,
  body: [
    {
      type: "ExpressionStatement",
      start: 29,
      end: 54,
      expression: {
        type: "AssignmentExpression",
        start: 29,
        end: 58,
        operator: "=",
        left: {
          type: "Identifier",
          start: 29,
          end: 30,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 43,
          end: 58,
          value: "\"foo\\tbar\"",
          raw: "\"\\\"foo\\\\tbar\\\"\""
        }
      }
    }
  ]
}, {
  preprocess: true
});

// All leading and trailing whitespace in text being stringified is ignored.
// Any sequence of whitespace in the middle of the text is converted to a single space
// in the stringified result.
test("#define stringify(arg)  #arg\nx = stringify(   foo  =\n                '  b a r  '   );\n", {
  type: "Program",
  start: 0,
  end: 86,
  body: [
    {
      type: "ExpressionStatement",
      start: 29,
      end: 85,
      expression: {
        type: "AssignmentExpression",
        start: 29,
        end: 65,
        operator: "=",
        left: {
          type: "Identifier",
          start: 29,
          end: 30,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 46,
          end: 65,
          value: "foo = '  b a r  '",
          raw: "\"foo = '  b a r  '\""
        }
      }
    }
  ]
}, {
  preprocess: true
});

// If you want to stringify the result of expansion of a macro argument,
// you have to use two levels of macros.
test("#define xstr(s) str(s)\n#define str(s) #s\n#define foo 4\nx = str (foo);\nx = xstr (foo);\n", {
  type: "Program",
  start: 0,
  end: 86,
  body: [
    {
      type: "ExpressionStatement",
      start: 55,
      end: 69,
      expression: {
        type: "AssignmentExpression",
        start: 55,
        end: 69,
        operator: "=",
        left: {
          type: "Identifier",
          start: 55,
          end: 56,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 64,
          end: 69,
          value: "foo",
          raw: "\"foo\""
        }
      }
    },
    {
      type: "ExpressionStatement",
      start: 70,
      end: 85,
      expression: {
        type: "AssignmentExpression",
        start: 70,
        end: 56,
        operator: "=",
        left: {
          type: "Identifier",
          start: 70,
          end: 71,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 53,
          end: 56,
          value: "4",
          raw: "\"4\""
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Empty arg becomes empty string
test("#define stringify2(arg1, arg2)  #arg2\nx = stringify2(foo,);\n", {
  type: "Program",
  start: 0,
  end: 60,
  body: [
    {
      type: "ExpressionStatement",
      start: 38,
      end: 59,
      expression: {
        type: "AssignmentExpression",
        start: 38,
        end: 35,
        operator: "=",
        left: {
          type: "Identifier",
          start: 38,
          end: 39,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 33,
          end: 35,
          value: "",
          raw: "\"\""
        }
      }
    }
  ]
}, {
  preprocess: true
});

// 3.5 Concatenation

test("#define concat(a, b) a ## b\nconcat(x, y)", {
  type: "Program",
  start: 0,
  end: 40,
  body: [
    {
      type: "ExpressionStatement",
      start: 35,
      end: 37,
      expression: {
        type: "Identifier",
        start: 35,
        end: 37,
        name: "xy"
      }
    }
  ]
}, {
  preprocess: true
});

test("#define concat(a, b) a ## b\nconcat(x, y)\n3", {
  type: "Program",
  start: 0,
  end: 42,
  body: [
    {
      type: "ExpressionStatement",
      start: 35,
      end: 37,
      expression: {
        type: "Identifier",
        start: 35,
        end: 37,
        name: "xy"
      }
    },
    {
      type: "ExpressionStatement",
      start: 41,
      end: 42,
      expression: {
        type: "Literal",
        start: 41,
        end: 42,
        value: 3
      }
    }
  ]
}, {
  preprocess: true
});

// As with stringification, the actual argument is not macro-expanded first.
test("#define foo 4\n#define concatenate(arg1, arg2)  arg1 + arg1 ## arg2 ## 7\nx = concatenate(foo, bar);\n", {
  type: "Program",
  start: 0,
  end: 99,
  body: [
    {
      type: "ExpressionStatement",
      start: 72,
      end: 98,
      expression: {
        type: "AssignmentExpression",
        start: 72,
        end: 95,
        operator: "=",
        left: {
          type: "Identifier",
          start: 72,
          end: 73,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 12,
          end: 95,
          left: {
            type: "Literal",
            start: 12,
            end: 13,
            value: 4,
            raw: "4"
          },
          operator: "+",
          right: {
            type: "Identifier",
            start: 88,
            end: 95,
            name: "foobar7"
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

// If the argument is empty, that `##' has no effect.
test("#define foo 4\n#define concatenate(arg1, arg2)  arg1 + arg1 ## arg2 ## 7\nx = concatenate(foo, );\n", {
  type: "Program",
  start: 0,
  end: 96,
  body: [
    {
      type: "ExpressionStatement",
      start: 72,
      end: 95,
      expression: {
        type: "AssignmentExpression",
        start: 72,
        end: 92,
        operator: "=",
        left: {
          type: "Identifier",
          start: 72,
          end: 73,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 12,
          end: 92,
          left: {
            type: "Literal",
            start: 12,
            end: 13,
            value: 4,
            raw: "4"
          },
          operator: "+",
          right: {
            type: "Identifier",
            start: 88,
            end: 92,
            name: "foo7"
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Only the leading and trailing tokens in argument are pasted
test("#define foo 4\n#define concatenate(arg1, arg2)  arg1 + arg1 ## arg2 ## 7\nx = concatenate(foo + 1, 7 + foo);\n", {
  type: "Program",
  start: 0,
  end: 107,
  body: [
    {
      type: "ExpressionStatement",
      start: 72,
      end: 106,
      expression: {
        type: "AssignmentExpression",
        start: 72,
        end: 105,
        operator: "=",
        left: {
          type: "Identifier",
          start: 72,
          end: 73,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 12,
          end: 105,
          left: {
            type: "BinaryExpression",
            start: 12,
            end: 96,
            left: {
              type: "BinaryExpression",
              start: 12,
              end: 13,
              left: {
                type: "BinaryExpression",
                start: 12,
                end: 95,
                left: {
                  type: "Literal",
                  start: 12,
                  end: 13,
                  value: 4,
                  raw: "4"
                },
                operator: "+",
                right: {
                  type: "Literal",
                  start: 94,
                  end: 95,
                  value: 1,
                  raw: "1"
                }
              },
              operator: "+",
              right: {
                type: "Literal",
                start: 12,
                end: 13,
                value: 4,
                raw: "4"
              }
            },
            operator: "+",
            right: {
              type: "Literal",
              start: 94,
              end: 96,
              value: 17,
              raw: "17"
            }
          },
          operator: "+",
          right: {
            type: "Identifier",
            start: 101,
            end: 105,
            name: "foo7"
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

test("#define COMMAND(NAME)  { name: #NAME, command: NAME ## _command }\nx = COMMAND(foo);\n", {
  type: "Program",
  start: 0,
  end: 84,
  body: [
    {
      type: "ExpressionStatement",
      start: 66,
      end: 83,
      expression: {
        type: "AssignmentExpression",
        start: 66,
        end: 65,
        operator: "=",
        left: {
          type: "Identifier",
          start: 66,
          end: 67,
          name: "x"
        },
        right: {
          type: "ObjectExpression",
          start: 23,
          end: 65,
          properties: [
            {
              key: {
                type: "Identifier",
                start: 25,
                end: 29,
                name: "name"
              },
              value: {
                type: "Literal",
                start: 78,
                end: 83,
                value: "foo",
                raw: "\"foo\""
              },
              kind: "init"
            },
            {
              key: {
                type: "Identifier",
                start: 38,
                end: 45,
                name: "command"
              },
              value: {
                type: "Identifier",
                start: 78,
                end: 89,
                name: "foo_command"
              },
              kind: "init"
            }
          ]
        }
      }
    }
  ]
}, {
  preprocess: true
});

// If the pasted token is invalid, a warning is issued and the two tokens are left as is
test("#define paste_fail(arg1, arg2)  arg1 ## arg2\nx = paste_fail(\"paste\", + \"me\");\n", {
  type: "Program",
  start: 0,
  end: 78,
  body: [
    {
      type: "ExpressionStatement",
      start: 45,
      end: 77,
      expression: {
        type: "AssignmentExpression",
        start: 45,
        end: 75,
        operator: "=",
        left: {
          type: "Identifier",
          start: 45,
          end: 46,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 60,
          end: 75,
          left: {
            type: "Literal",
            start: 60,
            end: 67,
            value: "paste",
            raw: "\"paste\""
          },
          operator: "+",
          right: {
            type: "Literal",
            start: 71,
            end: 75,
            value: "me",
            raw: "\"me\""
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Concatenation of tokens is possible when evaluating macros
test("#define X_FOO 1\n#define X(FEATURE) X_##FEATURE\n#if X(FOO)\nvar x;\n#endif", {
  type: "Program",
  start: 0,
  end: 71,
  body: [
    {
      type: "VariableDeclaration",
      start: 58,
      end: 64,
      declarations: [
        {
          type: "VariableDeclarator",
          start: 62,
          end: 63,
          id: {
            type: "Identifier",
            start: 62,
            end: 63,
            name: "x"
          },
          init: null
        }
      ],
      kind: "var"
    }
  ]
}, {
  preprocess: true
});

// 3.6 Variadic Macros

// Variadic macros may also have named parameters
test("#define variadic(arg, ...)  arg __VA_ARGS__\nx = variadic(7);\n", {
  type: "Program",
  start: 0,
  end: 61,
  body: [
    {
      type: "ExpressionStatement",
      start: 44,
      end: 60,
      expression: {
        type: "AssignmentExpression",
        start: 44,
        end: 58,
        operator: "=",
        left: {
          type: "Identifier",
          start: 44,
          end: 45,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 57,
          end: 58,
          value: 7,
          raw: "7"
        }
      }
    }
  ]
}, {
  preprocess: true
});

// The named parameter may be empty in the arguments, args are macro-expanded
test("#define ignore_arg(arg, ...)  arg someFunction(__VA_ARGS__)\n#define increment(arg)  arg + 1\nignore_arg(, \"foo\", increment(7), 13);\n", {
  type: "Program",
  start: 0,
  end: 131,
  body: [
    {
      type: "ExpressionStatement",
      start: 34,
      end: 130,
      expression: {
        type: "CallExpression",
        start: 34,
        end: 59,
        callee: {
          type: "Identifier",
          start: 34,
          end: 46,
          name: "someFunction"
        },
        arguments: [
          {
            type: "Literal",
            start: 105,
            end: 110,
            value: "foo",
            raw: "\"foo\""
          },
          {
            type: "BinaryExpression",
            start: 122,
            end: 91,
            left: {
              type: "Literal",
              start: 122,
              end: 123,
              value: 7,
              raw: "7"
            },
            operator: "+",
            right: {
              type: "Literal",
              start: 90,
              end: 91,
              value: 1,
              raw: "1"
            }
          },
          {
            type: "Literal",
            start: 126,
            end: 128,
            value: 13,
            raw: "13"
          }
        ]
      }
    }
  ]
}, {
  preprocess: true
});

// Both named and variadic parameters may be used together
test("#define debuglog(format, ...)  if (debugging) console.log(format, __VA_ARGS__)\ndebuglog(\"%s: (%d, %d)\", \"foo\", 13.27, 31.7);\n", {
  type: "Program",
  start: 0,
  end: 125,
  body: [
    {
      type: "IfStatement",
      start: 31,
      end: 124,
      test: {
        type: "Identifier",
        start: 35,
        end: 44,
        name: "debugging"
      },
      consequent: {
        type: "ExpressionStatement",
        start: 46,
        end: 124,
        expression: {
          type: "CallExpression",
          start: 46,
          end: 78,
          callee: {
            type: "MemberExpression",
            start: 46,
            end: 57,
            object: {
              type: "Identifier",
              start: 46,
              end: 53,
              name: "console"
            },
            property: {
              type: "Identifier",
              start: 54,
              end: 57,
              name: "log"
            },
            computed: false
          },
          arguments: [
            {
              type: "Literal",
              start: 88,
              end: 102,
              value: "%s: (%d, %d)",
              raw: "\"%s: (%d, %d)\""
            },
            {
              type: "Literal",
              start: 104,
              end: 109,
              value: "foo",
              raw: "\"foo\""
            },
            {
              type: "Literal",
              start: 111,
              end: 116,
              value: 13.27,
              raw: "13.27"
            },
            {
              type: "Literal",
              start: 118,
              end: 122,
              value: 31.7,
              raw: "31.7"
            }
          ]
        }
      },
      alternate: null
    }
  ]
}, {
  preprocess: true
});

// FIXME: The variable declaration node starting at 59 and ending at 84 should not include );. So 84 should really be 82.
test("#define variadic2(...)  __VA_ARGS__\nvariadic2();\nvariadic2(var x = 1, y = 2, z = 3);\n", {
  type: "Program",
  start: 0,
  end: 85,
  body: [
    {
      type: "EmptyStatement",
      start: 47,
      end: 48
    },
    {
      type: "VariableDeclaration",
      start: 59,
      end: 84,
      declarations: [
        {
          type: "VariableDeclarator",
          start: 63,
          end: 68,
          id: {
            type: "Identifier",
            start: 63,
            end: 64,
            name: "x"
          },
          init: {
            type: "Literal",
            start: 67,
            end: 68,
            value: 1,
            raw: "1"
          }
        },
        {
          type: "VariableDeclarator",
          start: 70,
          end: 75,
          id: {
            type: "Identifier",
            start: 70,
            end: 71,
            name: "y"
          },
          init: {
            type: "Literal",
            start: 74,
            end: 75,
            value: 2,
            raw: "2"
          }
        },
        {
          type: "VariableDeclarator",
          start: 77,
          end: 82,
          id: {
            type: "Identifier",
            start: 77,
            end: 78,
            name: "z"
          },
          init: {
            type: "Literal",
            start: 81,
            end: 82,
            value: 3,
            raw: "3"
          }
        }
      ],
      kind: "var"
    }
  ]
}, {
  preprocess: true
});

// The variadic parameters may be named
test("#define variadic3(args...) console.log(args);\nvariadic3(\"(%d, %d)\", x, y);\n", {
  type: "Program",
  start: 0,
  end: 75,
  body: [
    {
      type: "ExpressionStatement",
      start: 27,
      end: 45,
      expression: {
        type: "CallExpression",
        start: 27,
        end: 44,
        callee: {
          type: "MemberExpression",
          start: 27,
          end: 38,
          object: {
            type: "Identifier",
            start: 27,
            end: 34,
            name: "console"
          },
          property: {
            type: "Identifier",
            start: 35,
            end: 38,
            name: "log"
          },
          computed: false
        },
        arguments: [
          {
            type: "Literal",
            start: 56,
            end: 66,
            value: "(%d, %d)",
            raw: "\"(%d, %d)\""
          },
          {
            type: "Identifier",
            start: 68,
            end: 69,
            name: "x"
          },
          {
            type: "Identifier",
            start: 71,
            end: 72,
            name: "y"
          }
        ]
      }
    },
    {
      type: "EmptyStatement",
      start: 73,
      end: 74
    }
  ]
}, {
  preprocess: true
});

// ## between a comma and the variadic parameter name allows the variadic args to be omitted.
test("#define emptyVariadic(format, args...) console.log(format, ##args)\nemptyVariadic(\"(%d, %d)\", x, y);\nemptyVariadic(\"(%d, %d)\");\n", {
  type: "Program",
  start: 0,
  end: 127,
  body: [
    {
      type: "ExpressionStatement",
      start: 39,
      end: 99,
      expression: {
        type: "CallExpression",
        start: 39,
        end: 66,
        callee: {
          type: "MemberExpression",
          start: 39,
          end: 50,
          object: {
            type: "Identifier",
            start: 39,
            end: 46,
            name: "console"
          },
          property: {
            type: "Identifier",
            start: 47,
            end: 50,
            name: "log"
          },
          computed: false
        },
        arguments: [
          {
            type: "Literal",
            start: 81,
            end: 91,
            value: "(%d, %d)",
            raw: "\"(%d, %d)\""
          },
          {
            type: "Identifier",
            start: 93,
            end: 94,
            name: "x"
          },
          {
            type: "Identifier",
            start: 96,
            end: 97,
            name: "y"
          }
        ]
      }
    },
    {
      type: "ExpressionStatement",
      start: 39,
      end: 126,
      expression: {
        type: "CallExpression",
        start: 39,
        end: 66,
        callee: {
          type: "MemberExpression",
          start: 39,
          end: 50,
          object: {
            type: "Identifier",
            start: 39,
            end: 46,
            name: "console"
          },
          property: {
            type: "Identifier",
            start: 47,
            end: 50,
            name: "log"
          },
          computed: false
        },
        arguments: [
          {
            type: "Literal",
            start: 114,
            end: 124,
            value: "(%d, %d)",
            raw: "\"(%d, %d)\""
          }
        ]
      }
    }
  ]
}, {
  preprocess: true
});

// Using a predefined macro to change the definition of another variadic macro
test("#if DEBUG\n#define LOG(format, args...) console.log(format, ##args)\n#else\n#define LOG(...)\n#endif\n\nLOG(\"(%d, %d)\", x, y);\nLOG(\"This is awesome!\");\n", {
  type: "Program",
  start: 0,
  end: 146,
  body: [
    {
      type: "EmptyStatement",
      start: 119,
      end: 120
    },
    {
      type: "EmptyStatement",
      start: 144,
      end: 145
    }
  ]
}, {
  preprocess: true
});

// Using a predefined macro to change the definition of another variadic macro
test("#if DEBUG\n#define LOG(format, args...) console.log(format, ##args)\n#else\n#define LOG(...)\n#endif\n\nLOG(\"(@d, @d)\", x, y);\nLOG(\"This is awesome!\");\n", {
  type: "Program",
  start: 0,
  end: 146,
  body: [
    {
      type: "ExpressionStatement",
      start: 39,
      end: 120,
      expression: {
        type: "CallExpression",
        start: 39,
        end: 66,
        callee: {
          type: "MemberExpression",
          start: 39,
          end: 50,
          object: {
            type: "Identifier",
            start: 39,
            end: 46,
            name: "console"
          },
          property: {
            type: "Identifier",
            start: 47,
            end: 50,
            name: "log"
          },
          computed: false
        },
        arguments: [
          {
            type: "Literal",
            start: 102,
            end: 112,
            value: "(@d, @d)",
            raw: "\"(@d, @d)\""
          },
          {
            type: "Identifier",
            start: 114,
            end: 115,
            name: "x"
          },
          {
            type: "Identifier",
            start: 117,
            end: 118,
            name: "y"
          }
        ]
      }
    },
    {
      type: "ExpressionStatement",
      start: 39,
      end: 145,
      expression: {
        type: "CallExpression",
        start: 39,
        end: 66,
        callee: {
          type: "MemberExpression",
          start: 39,
          end: 50,
          object: {
            type: "Identifier",
            start: 39,
            end: 46,
            name: "console"
          },
          property: {
            type: "Identifier",
            start: 47,
            end: 50,
            name: "log"
          },
          computed: false
        },
        arguments: [
          {
            type: "Literal",
            start: 125,
            end: 143,
            value: "This is awesome!",
            raw: "\"This is awesome!\""
          }
        ]
      }
    }
  ]
}, {
  preprocess: true,
  macros: ["DEBUG"]
});

// 3.7.1 Standard Predefined Macros

test("objj = __OBJJ__;\n", {
  type: "Program",
  start: 0,
  end: 17,
  body: [
    {
      type: "ExpressionStatement",
      start: 0,
      end: 16,
      expression: {
        type: "AssignmentExpression",
        start: 0,
        end: 8,
        operator: "=",
        left: {
          type: "Identifier",
          start: 0,
          end: 4,
          name: "objj"
        },
        right: {
          type: "Literal",
          start: 7,
          end: 8,
          value: 1,
          raw: "1"
        }
      }
    }
  ]
}, {
  preprocess: true,
  objj: true
});

test("objj = __OBJJ__;\n", {
  type: "Program",
  start: 0,
  end: 17,
  body: [
    {
      type: "ExpressionStatement",
      start: 0,
      end: 16,
      expression: {
        type: "AssignmentExpression",
        start: 0,
        end: 15,
        operator: "=",
        left: {
          type: "Identifier",
          start: 0,
          end: 4,
          name: "objj"
        },
        right: {
          type: "Identifier",
          start: 7,
          end: 15,
          name: "__OBJJ__"
        }
      }
    }
  ]
}, {
  preprocess: true,
  objj: false
});

if (typeof(window) !== "undefined")
  test("#ifdef __BROWSER__\n\"browser\";\n#else\n\"CommonJS\";\n#endif\n", {
    type: "Program",
    start: 0,
    end: 29,
    body: [
      {
        type: "ExpressionStatement",
        start: 19,
        end: 29,
        expression: {
          type: "Literal",
          start: 19,
          end: 28,
          value: "browser",
          raw: "\"browser\""
        }
      }
    ]
  }, {
    preprocess: true
  });
else
  test("#ifdef __BROWSER__\n\"browser\";\n#else\n\"CommonJS\";\n#endif\n", {
    type: "Program",
    start: 0,
    end: 55,
    body: [
      {
        type: "ExpressionStatement",
        start: 36,
        end: 47,
        expression: {
          type: "Literal",
          start: 36,
          end: 46,
          value: "CommonJS",
          raw: "\"CommonJS\""
        }
      }
    ]
  }, {
    preprocess: true
  });

// 3.10.1 Misnesting

test("#define twice(x) (2*(x))\n#define call_with_1(x) x(1)\ncall_with_1 (twice);\n", {
  type: "Program",
  start: 0,
  end: 74,
  body: [
    {
      type: "ExpressionStatement",
      start: 17,
      end: 73,
      expression: {
        type: "BinaryExpression",
        start: 18,
        end: 23,
        left: {
          type: "Literal",
          start: 18,
          end: 19,
          value: 2,
          raw: "2"
        },
        operator: "*",
        right: {
          type: "Literal",
          start: 68,
          end: 69,
          value: 1,
          raw: "1"
        }
      }
    }
  ]
}, {
  preprocess: true
});

test("#define strange(file) fprintf (file, \"%s %d\",\nstrange(stderr) p, 35);\n", {
  type: "Program",
  start: 0,
  end: 70,
  body: [
    {
      type: "ExpressionStatement",
      start: 22,
      end: 69,
      expression: {
        type: "CallExpression",
        start: 22,
        end: 68,
        callee: {
          type: "Identifier",
          start: 22,
          end: 29,
          name: "fprintf"
        },
        arguments: [
          {
            type: "Identifier",
            start: 54,
            end: 60,
            name: "stderr"
          },
          {
            type: "Literal",
            start: 37,
            end: 44,
            value: "%s %d",
            raw: "\"%s %d\""
          },
          {
            type: "Identifier",
            start: 62,
            end: 63,
            name: "p"
          },
          {
            type: "Literal",
            start: 65,
            end: 67,
            value: 35,
            raw: "35"
          }
        ]
      }
    }
  ]
}, {
  preprocess: true
});

// 3.10.5 Self-Referential Macros

test("#define self_reference (4 + self_reference)\nx = self_reference;\n", {
  type: "Program",
  start: 0,
  end: 64,
  body: [
    {
      type: "ExpressionStatement",
      start: 44,
      end: 63,
      expression: {
        type: "AssignmentExpression",
        start: 44,
        end: 43,
        operator: "=",
        left: {
          type: "Identifier",
          start: 44,
          end: 45,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 24,
          end: 42,
          left: {
            type: "Literal",
            start: 24,
            end: 25,
            value: 4,
            raw: "4"
          },
          operator: "+",
          right: {
            type: "Identifier",
            start: 28,
            end: 42,
            name: "self_reference"
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

test("#define EPERM EPERM\nx = EPERM;\n", {
  type: "Program",
  start: 0,
  end: 31,
  body: [
    {
      type: "ExpressionStatement",
      start: 20,
      end: 30,
      expression: {
        type: "AssignmentExpression",
        start: 20,
        end: 19,
        operator: "=",
        left: {
          type: "Identifier",
          start: 20,
          end: 21,
          name: "x"
        },
        right: {
          type: "Identifier",
          start: 14,
          end: 19,
          name: "EPERM"
        }
      }
    }
  ]
}, {
  preprocess: true
});

test("#define ref1 (4 + ref2)\n#define ref2 (2 * ref1)\nx = ref1;\ny = ref2;\n", {
  type: "Program",
  start: 0,
  end: 68,
  body: [
    {
      type: "ExpressionStatement",
      start: 48,
      end: 57,
      expression: {
        type: "AssignmentExpression",
        start: 48,
        end: 23,
        operator: "=",
        left: {
          type: "Identifier",
          start: 48,
          end: 49,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 14,
          end: 47,
          left: {
            type: "Literal",
            start: 14,
            end: 15,
            value: 4,
            raw: "4"
          },
          operator: "+",
          right: {
            type: "BinaryExpression",
            start: 38,
            end: 46,
            left: {
              type: "Literal",
              start: 38,
              end: 39,
              value: 2,
              raw: "2"
            },
            operator: "*",
            right: {
              type: "Identifier",
              start: 42,
              end: 46,
              name: "ref1"
            }
          }
        }
      }
    },
    {
      type: "ExpressionStatement",
      start: 58,
      end: 67,
      expression: {
        type: "AssignmentExpression",
        start: 58,
        end: 47,
        operator: "=",
        left: {
          type: "Identifier",
          start: 58,
          end: 59,
          name: "y"
        },
        right: {
          type: "BinaryExpression",
          start: 38,
          end: 23,
          left: {
            type: "Literal",
            start: 38,
            end: 39,
            value: 2,
            raw: "2"
          },
          operator: "*",
          right: {
            type: "BinaryExpression",
            start: 14,
            end: 22,
            left: {
              type: "Literal",
              start: 14,
              end: 15,
              value: 4,
              raw: "4"
            },
            operator: "+",
            right: {
              type: "Identifier",
              start: 18,
              end: 22,
              name: "ref2"
            }
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

// 3.10.6 Argument Prescan

test("#define f(arg) arg * 2\nx = f (f (f(1)));\n", {
  type: "Program",
  start: 0,
  end: 41,
  body: [
    {
      type: "ExpressionStatement",
      start: 23,
      end: 40,
      expression: {
        type: "AssignmentExpression",
        start: 23,
        end: 22,
        operator: "=",
        left: {
          type: "Identifier",
          start: 23,
          end: 24,
          name: "x"
        },
        right: {
          type: "BinaryExpression",
          start: 35,
          end: 22,
          left: {
            type: "BinaryExpression",
            start: 35,
            end: 22,
            left: {
              type: "BinaryExpression",
              start: 35,
              end: 22,
              left: {
                type: "Literal",
                start: 35,
                end: 36,
                value: 1,
                raw: "1"
              },
              operator: "*",
              right: {
                type: "Literal",
                start: 21,
                end: 22,
                value: 2,
                raw: "2"
              }
            },
            operator: "*",
            right: {
              type: "Literal",
              start: 21,
              end: 22,
              value: 2,
              raw: "2"
            }
          },
          operator: "*",
          right: {
            type: "Literal",
            start: 21,
            end: 22,
            value: 2,
            raw: "2"
          }
        }
      }
    }
  ]
}, {
  preprocess: true
});

test("#define AFTERX(x) X_ ## x\n#define XAFTERX(x) AFTERX(x)\n#define TABLESIZE 1024\n#define BUFSIZE TABLESIZE\nvar a = AFTERX(BUFSIZE),\n    b = XAFTERX(BUFSIZE);\n", {
  type: "Program",
  start: 0,
  end: 155,
  body: [
    {
      type: "VariableDeclaration",
      start: 104,
      end: 154,
      declarations: [
        {
          type: "VariableDeclarator",
          start: 108,
          end: 27,
          id: {
            type: "Identifier",
            start: 108,
            end: 109,
            name: "a"
          },
          init: {
            type: "Identifier",
            start: 18,
            end: 27,
            name: "X_BUFSIZE"
          }
        },
        {
          type: "VariableDeclarator",
          start: 133,
          end: 24,
          id: {
            type: "Identifier",
            start: 133,
            end: 134,
            name: "b"
          },
          init: {
            type: "Identifier",
            start: 18,
            end: 24,
            name: "X_1024"
          }
        }
      ],
      kind: "var"
    }
  ]
}, {
  preprocess: true
});

test("#define foo  (a,b)\n#define bar(x) lose(x)\n#define lose(x) (1 + (x))\nbar(foo);\n", {
  type: "Program",
  start: 0,
  end: 78,
  body: [
    {
      type: "ExpressionStatement",
      start: 58,
      end: 77,
      expression: {
        type: "BinaryExpression",
        start: 59,
        end: 66,
        left: {
          type: "Literal",
          start: 59,
          end: 60,
          value: 1,
          raw: "1"
        },
        operator: "+",
        right: {
          type: "SequenceExpression",
          start: 14,
          end: 17,
          expressions: [
            {
              type: "Identifier",
              start: 14,
              end: 15,
              name: "a"
            },
            {
              type: "Identifier",
              start: 16,
              end: 17,
              name: "b"
            }
          ]
        }
      }
    }
  ]
}, {
  preprocess: true
});

test("#define lose(x) (1 + (x))\n#define foo  a,b\n#define bar(x) lose((x))\nbar(foo);\n", {
  type: "Program",
  start: 0,
  end: 78,
  body: [
    {
      type: "ExpressionStatement",
      start: 16,
      end: 77,
      expression: {
        type: "BinaryExpression",
        start: 17,
        end: 24,
        left: {
          type: "Literal",
          start: 17,
          end: 18,
          value: 1,
          raw: "1"
        },
        operator: "+",
        right: {
          type: "SequenceExpression",
          start: 39,
          end: 42,
          expressions: [
            {
              type: "Identifier",
              start: 39,
              end: 40,
              name: "a"
            },
            {
              type: "Identifier",
              start: 41,
              end: 42,
              name: "b"
            }
          ]
        }
      }
    }
  ]
}, {
  preprocess: true
});

// 4.2 Conditional syntax

// #ifdef fails if macro is undefined, succeeds if it is defined. #ifndef does the opposite.
test("#ifdef FOO\n\"foo defined\";\n#endif\n\n#ifndef FOO\n\"foo undefined\";\n#endif\n\n#ifdef __OBJJ__\n\"objj defined\";\n#endif\n\n#ifndef __OBJJ__\n\"objj undefined\";\n#endif\n", {
  type: "Program",
  start: 0,
  end: 153,
  body: [
    {
      type: "ExpressionStatement",
      start: 46,
      end: 62,
      expression: {
        type: "Literal",
        start: 46,
        end: 61,
        value: "foo undefined",
        raw: "\"foo undefined\""
      }
    },
    {
      type: "ExpressionStatement",
      start: 87,
      end: 102,
      expression: {
        type: "Literal",
        start: 87,
        end: 101,
        value: "objj defined",
        raw: "\"objj defined\""
      }
    }
  ]
}, {
  preprocess: true,
  objj: true
});

// #if with arithmetic and logical OR operators. Only the last test in the expression succeeds.
test("#if (1 + 1 === 3) || (2 - 1 === 0) || (2 * 2 === 5) || (2 / 2 === 2) || (3 % 2 === 1)\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 99,
  body: [
    {
      type: "ExpressionStatement",
      start: 86,
      end: 91,
      expression: {
        type: "Literal",
        start: 86,
        end: 90,
        value: true,
        raw: "true"
      }
    }
  ]
}, {
  preprocess: true
});

// #if with arithmetic and logical AND operators. All of the tests in the expression succeed.
test("#if (1 + 1 === 2) && (2 - 1 === 1) && (2 * 2 === 4) && (2 / 2 === 1) && (3 % 2 === 1)\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 99,
  body: [
    {
      type: "ExpressionStatement",
      start: 86,
      end: 91,
      expression: {
        type: "Literal",
        start: 86,
        end: 90,
        value: true,
        raw: "true"
      }
    }
  ]
}, {
  preprocess: true
});

// #if with arithmetic and logical AND operators. All of the tests except the last in the expression succeed.
test("#if (1 + 1 === 2) && (2 - 1 === 1) && (2 * 2 === 4) && (2 / 2 === 1) && (3 % 2 === 0)\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 99,
  body: []
}, {
  preprocess: true
});

// #if with bitwise and logical AND operators. All of the tests in the expression succeed.
test("#if ((3 & 1) === 1) && ((3 | 0) === 3) && ((3 ^ 3) === 0) && (~1 === -2) && (1 << 2 === 4) && (-2 >> 1 === -1) && (-2 >>> 1 === 2147483647)\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 153,
  body: [
    {
      type: "ExpressionStatement",
      start: 140,
      end: 145,
      expression: {
        type: "Literal",
        start: 140,
        end: 144,
        value: true,
        raw: "true"
      }
    }
  ]
}, {
  preprocess: true
});

// #if with comparison and logical AND operators. All of the tests in the expression succeed.
test("#if (7 == 7) && (7 == \"7\") && (7 === 7) && (7 != 13) && (7 != \"13\") && (7 !== 13) && (13 > 7) && (13 >= 13) && (13 < 27) && (27 <= 27)\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 148,
  body: [
    {
      type: "ExpressionStatement",
      start: 135,
      end: 140,
      expression: {
        type: "Literal",
        start: 135,
        end: 139,
        value: true,
        raw: "true"
      }
    }
  ]
}, {
  preprocess: true
});

// #if with logical ! operator.
test("#if (1 == 0) || !(1 == 0)\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 39,
  body: [
    {
      type: "ExpressionStatement",
      start: 26,
      end: 31,
      expression: {
        type: "Literal",
        start: 26,
        end: 30,
        value: true,
        raw: "true"
      }
    }
  ]
}, {
  preprocess: true
});

// Macros are expanded within the #if expression
test("#define FOO(arg) arg * 2\n\n#if FOO(3) === 6\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 56,
  body: [
    {
      type: "ExpressionStatement",
      start: 43,
      end: 48,
      expression: {
        type: "Literal",
        start: 43,
        end: 47,
        value: true,
        raw: "true"
      }
    }
  ]
}, {
  preprocess: true
});

// Identifiers that are not macros are considered to be the number zero.
// Function macros that are used without arguments are also treated as zero.
test("#define FOO(arg) arg * 2\n\n#if FOO === 0 && BAR === 0\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 66,
  body: [
    {
      type: "ExpressionStatement",
      start: 53,
      end: 58,
      expression: {
        type: "Literal",
        start: 53,
        end: 57,
        value: true,
        raw: "true"
      }
    }
  ]
}, {
  preprocess: true
});

// `defined` may be used to test existence of a macro. Both 'defined FOO' and 'defined(FOO)' are accepted.
test("#define FOO(arg) arg * 2\n\n#if defined FOO && defined(FOO)\ntrue;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 71,
  body: [
    {
      type: "ExpressionStatement",
      start: 58,
      end: 63,
      expression: {
        type: "Literal",
        start: 58,
        end: 62,
        value: true,
        raw: "true"
      }
    }
  ]
}, {
  preprocess: true
});

// #else
test("#define FOO(arg) arg * 2\n\n#if defined FOO\ntrue;\n#else\nfalse;\n#endif\n\n#if defined BAR\ntrue;\n#else\nfalse;\n#endif\n", {
  type: "Program",
  start: 0,
  end: 111,
  body: [
    {
      type: "ExpressionStatement",
      start: 42,
      end: 47,
      expression: {
        type: "Literal",
        start: 42,
        end: 46,
        value: true,
        raw: "true"
      }
    },
    {
      type: "ExpressionStatement",
      start: 97,
      end: 103,
      expression: {
        type: "Literal",
        start: 97,
        end: 102,
        value: false,
        raw: "false"
      }
    }
  ]
}, {
  preprocess: true
});

// #elif
test("#if defined FOO\n\"foo\";\n#elif defined BAR\n\"bar\";\n#else\n\"baz\";\n#endif\n", {
  type: "Program",
  start: 0,
  end: 68,
  body: [
    {
      type: "ExpressionStatement",
      start: 54,
      end: 60,
      expression: {
        type: "Literal",
        start: 54,
        end: 59,
        value: "baz",
        raw: "\"baz\""
      }
    }
  ]
}, {
  preprocess: true
});

// #include
test("a = 1\n#include \"x.h\"\nb = 2", {
  type: "Program",
  start: 0,
  end: 26,
  body: [
    {
      type: "ExpressionStatement",
      start: 0,
      end: 5,
      expression: {
        type: "AssignmentExpression",
        start: 0,
        end: 5,
        operator: "=",
        left: {
          type: "Identifier",
          start: 0,
          end: 1,
          name: "a"
        },
        right: {
          type: "Literal",
          start: 4,
          end: 5,
          value: 1,
          raw: "1"
        }
      }
    },
    {
      type: "VariableDeclaration",
      start: 0,
      end: 10,
      declarations: [
        {
          type: "VariableDeclarator",
          start: 4,
          end: 9,
          id: {
            type: "Identifier",
            start: 4,
            end: 5,
            name: "a"
          },
          init: {
            type: "Literal",
            start: 8,
            end: 9,
            value: 9,
            raw: "9"
          }
        }
      ],
      kind: "var"
    },
    {
      type: "ExpressionStatement",
      start: 21,
      end: 26,
      expression: {
        type: "AssignmentExpression",
        start: 21,
        end: 26,
        operator: "=",
        left: {
          type: "Identifier",
          start: 21,
          end: 22,
          name: "b"
        },
        right: {
          type: "Literal",
          start: 25,
          end: 26,
          value: 2,
          raw: "2"
        }
      }
    }
  ]
}, {
  preprocess: true,
  preprocessGetIncludeFile: function(filename, islocalfilepath) {
    return {include: "var a = 9;\n", sourceFile: filename};
  },
  locations: true
});

// #include with an #if/#else/#endif
test("c = 1\n#include \"x.h\"\nb = 2", {
  type: "Program",
  start: 0,
  end: 26,
  loc: {
    start: {
      line: 1,
      column: 0
    },
    end: {
      line: 3,
      column: 5
    }
  },
  body: [
    {
      type: "ExpressionStatement",
      start: 0,
      end: 5,
      loc: {
        start: {
          line: 1,
          column: 0
        },
        end: {
          line: 1,
          column: 5
        }
      },
      expression: {
        type: "AssignmentExpression",
        start: 0,
        end: 5,
        loc: {
          start: {
            line: 1,
            column: 0
          },
          end: {
            line: 1,
            column: 5
          }
        },
        operator: "=",
        left: {
          type: "Identifier",
          start: 0,
          end: 1,
          loc: {
            start: {
              line: 1,
              column: 0
            },
            end: {
              line: 1,
              column: 1
            }
          },
          name: "c"
        },
        right: {
          type: "Literal",
          start: 4,
          end: 5,
          loc: {
            start: {
              line: 1,
              column: 4
            },
            end: {
              line: 1,
              column: 5
            }
          },
          value: 1,
          raw: "1"
        }
      }
    },
    {
      type: "VariableDeclaration",
      start: 27,
      end: 37,
      loc: {
        start: {
          line: 4,
          column: 0
        },
        end: {
          line: 4,
          column: 10
        },
        source: "x.h"
      },
      declarations: [
        {
          type: "VariableDeclarator",
          start: 31,
          end: 36,
          loc: {
            start: {
              line: 4,
              column: 4
            },
            end: {
              line: 4,
              column: 9
            },
            source: "x.h"
          },
          id: {
            type: "Identifier",
            start: 31,
            end: 32,
            loc: {
              start: {
                line: 4,
                column: 4
              },
              end: {
                line: 4,
                column: 5
              },
              source: "x.h"
            },
            name: "a"
          },
          init: {
            type: "Literal",
            start: 35,
            end: 36,
            loc: {
              start: {
                line: 4,
                column: 8
              },
              end: {
                line: 4,
                column: 9
              },
              source: "x.h"
            },
            value: 1,
            raw: "1"
          }
        }
      ],
      kind: "var"
    },
    {
      type: "ExpressionStatement",
      start: 21,
      end: 26,
      loc: {
        start: {
          line: 3,
          column: 0
        },
        end: {
          line: 3,
          column: 5
        }
      },
      expression: {
        type: "AssignmentExpression",
        start: 21,
        end: 26,
        loc: {
          start: {
            line: 3,
            column: 0
          },
          end: {
            line: 3,
            column: 5
          }
        },
        operator: "=",
        left: {
          type: "Identifier",
          start: 21,
          end: 22,
          loc: {
            start: {
              line: 3,
              column: 0
            },
            end: {
              line: 3,
              column: 1
            }
          },
          name: "b"
        },
        right: {
          type: "Literal",
          start: 25,
          end: 26,
          loc: {
            start: {
              line: 3,
              column: 4
            },
            end: {
              line: 3,
              column: 5
            }
          },
          value: 2,
          raw: "2"
        }
      }
    }
  ]
}, {
  preprocess: true,
  preprocessGetIncludeFile: function(filename, islocalfilepath) {
    return {include: "#if DEBUG\nvar a = 9;\n#else\nvar a = 1;\n#endif\n", sourceFile: filename};
  },
  locations: true
});

// pre include files
test("var y = 3;", {
  type: "Program",
  start: 0,
  end: 10,
  body: [
    {
      type: "VariableDeclaration",
      start: 0,
      end: 6,
      declarations: [
        {
          type: "VariableDeclarator",
          start: 4,
          end: 5,
          id: {
            type: "Identifier",
            start: 4,
            end: 5,
            name: "x"
          },
          init: null
        }
      ],
      kind: "var"
    },
    {
      type: "VariableDeclaration",
      start: 0,
      end: 10,
      declarations: [
        {
          type: "VariableDeclarator",
          start: 4,
          end: 9,
          id: {
            type: "Identifier",
            start: 4,
            end: 5,
            name: "y"
          },
          init: {
            type: "Literal",
            start: 8,
            end: 9,
            value: 3,
            raw: "3"
          }
        }
      ],
      kind: "var"
    }
  ]
}, {
  preprocess: true,
  preIncludeFiles: [{include:"var x;\n", sourceFile:"preinclude.file"}],
  locations: true
});

// two pre include files defining macros with comment row in one
test("FOO(3);\nBAR(7);", {
  type: "Program",
  start: 0,
  end: 15,
  body: [
    {
      type: "ExpressionStatement",
      start: 4,
      end: 7,
      expression: {
        type: "Literal",
        start: 4,
        end: 5,
        value: 3,
        raw: "3"
      }
    },
    {
      type: "ExpressionStatement",
      start: 12,
      end: 15,
      expression: {
        type: "Literal",
        start: 12,
        end: 13,
        value: 7,
        raw: "7"
      }
    }
  ]
}, {
  preprocess: true,
  preIncludeFiles: [{include:"#define FOO(n) n\n", sourceFile:"preinclude1.file"}, {include:"//x\n#define BAR(x) x\n", sourceFile:"preinclude2.file"}],
  locations: true
});

// two pre include files defining macros with comment row in one. Should not matter in witch order
test("FOO(3);\nBAR(7);", {
  type: "Program",
  start: 0,
  end: 15,
  body: [
    {
      type: "ExpressionStatement",
      start: 4,
      end: 7,
      expression: {
        type: "Literal",
        start: 4,
        end: 5,
        value: 3,
        raw: "3"
      }
    },
    {
      type: "ExpressionStatement",
      start: 12,
      end: 15,
      expression: {
        type: "Literal",
        start: 12,
        end: 13,
        value: 7,
        raw: "7"
      }
    }
  ]
}, {
  preprocess: true,
  preIncludeFiles: [{include:"//x\n#define BAR(x) x\n", sourceFile:"preinclude2.file"}, {include:"#define FOO(n) n\n", sourceFile:"preinclude1.file"}],
  locations: true
});

// #include with an #if/#else/#endif
test("//xxxxx\na = 1\n#include \"x.h\"\n#define DEBUG 1\n#include \"x.h\"\nb = 2", {
  type: "Program",
  start: 0,
  end: 65,
  loc: {
    start: {
      line: 1,
      column: 0
    },
    end: {
      line: 6,
      column: 5
    }
  },
  body: [
    {
      type: "ExpressionStatement",
      start: 8,
      end: 13,
      loc: {
        start: {
          line: 2,
          column: 0
        },
        end: {
          line: 2,
          column: 5
        }
      },
      expression: {
        type: "AssignmentExpression",
        start: 8,
        end: 13,
        loc: {
          start: {
            line: 2,
            column: 0
          },
          end: {
            line: 2,
            column: 5
          }
        },
        operator: "=",
        left: {
          type: "Identifier",
          start: 8,
          end: 9,
          loc: {
            start: {
              line: 2,
              column: 0
            },
            end: {
              line: 2,
              column: 1
            }
          },
          name: "a"
        },
        right: {
          type: "Literal",
          start: 12,
          end: 13,
          loc: {
            start: {
              line: 2,
              column: 4
            },
            end: {
              line: 2,
              column: 5
            }
          },
          value: 1,
          raw: "1"
        }
      }
    },
    {
      type: "VariableDeclaration",
      start: 27,
      end: 37,
      loc: {
        start: {
          line: 4,
          column: 0
        },
        end: {
          line: 4,
          column: 10
        },
        source: "x.h"
      },
      declarations: [
        {
          type: "VariableDeclarator",
          start: 31,
          end: 36,
          loc: {
            start: {
              line: 4,
              column: 4
            },
            end: {
              line: 4,
              column: 9
            },
            source: "x.h"
          },
          id: {
            type: "Identifier",
            start: 31,
            end: 32,
            loc: {
              start: {
                line: 4,
                column: 4
              },
              end: {
                line: 4,
                column: 5
              },
              source: "x.h"
            },
            name: "a"
          },
          init: {
            type: "Literal",
            start: 35,
            end: 36,
            loc: {
              start: {
                line: 4,
                column: 8
              },
              end: {
                line: 4,
                column: 9
              },
              source: "x.h"
            },
            value: 1,
            raw: "1"
          }
        }
      ],
      kind: "var"
    },
    {
      type: "VariableDeclaration",
      start: 10,
      end: 20,
      loc: {
        start: {
          line: 2,
          column: 0
        },
        end: {
          line: 2,
          column: 10
        },
        source: "x.h"
      },
      declarations: [
        {
          type: "VariableDeclarator",
          start: 14,
          end: 19,
          loc: {
            start: {
              line: 2,
              column: 4
            },
            end: {
              line: 2,
              column: 9
            },
            source: "x.h"
          },
          id: {
            type: "Identifier",
            start: 14,
            end: 15,
            loc: {
              start: {
                line: 2,
                column: 4
              },
              end: {
                line: 2,
                column: 5
              },
              source: "x.h"
            },
            name: "a"
          },
          init: {
            type: "Literal",
            start: 18,
            end: 19,
            loc: {
              start: {
                line: 2,
                column: 8
              },
              end: {
                line: 2,
                column: 9
              },
              source: "x.h"
            },
            value: 9,
            raw: "9"
          }
        }
      ],
      kind: "var"
    },
    {
      type: "ExpressionStatement",
      start: 60,
      end: 65,
      loc: {
        start: {
          line: 6,
          column: 0
        },
        end: {
          line: 6,
          column: 5
        }
      },
      expression: {
        type: "AssignmentExpression",
        start: 60,
        end: 65,
        loc: {
          start: {
            line: 6,
            column: 0
          },
          end: {
            line: 6,
            column: 5
          }
        },
        operator: "=",
        left: {
          type: "Identifier",
          start: 60,
          end: 61,
          loc: {
            start: {
              line: 6,
              column: 0
            },
            end: {
              line: 6,
              column: 1
            }
          },
          name: "b"
        },
        right: {
          type: "Literal",
          start: 64,
          end: 65,
          loc: {
            start: {
              line: 6,
              column: 4
            },
            end: {
              line: 6,
              column: 5
            }
          },
          value: 2,
          raw: "2"
        }
      }
    }
  ]
}, {
  preprocess: true,
  preprocessGetIncludeFile: function(filename, islocalfilepath) {
    return {include: "#if DEBUG\nvar a = 9;\n#else\nvar a = 1;\n#endif\n", sourceFile: filename};
  },
  locations: true
});

// Comments/spaces are only tracked for sections of code that are not skipped
// This test is turned off as we don't track comments like this currently
/*test("x = 0;\n// before #if\n#if 1\n// before 1\nx = 1;\n// after 1\n#else\n// before 2\nx = 2\n// after 2\n#endif\n\n// after #if\nx;\n", {
  type: "Program",
  start: 0,
  end: 115,
  body: [
    {
      type: "ExpressionStatement",
      start: 0,
      end: 6,
      expression: {
        type: "AssignmentExpression",
        start: 0,
        end: 5,
        operator: "=",
        left: {
          type: "Identifier",
          start: 0,
          end: 1,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 4,
          end: 5,
          value: 0,
          raw: "0"
        }
      },
      commentsAfter: [
        "// before #if",
        "// before 1"
      ]
    },
    {
      type: "ExpressionStatement",
      start: 39,
      end: 45,
      commentsBefore: [
        "// before #if",
        "// before 1"
      ],
      expression: {
        type: "AssignmentExpression",
        start: 39,
        end: 44,
        operator: "=",
        left: {
          type: "Identifier",
          start: 39,
          end: 40,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 43,
          end: 44,
          value: 1,
          raw: "1"
        }
      },
      commentsAfter: [
        "// after 1",
        "// after #if"
      ]
    },
    {
      type: "ExpressionStatement",
      start: 113,
      end: 115,
      commentsBefore: [
        "// after 1",
        "// after #if"
      ],
      expression: {
        type: "Identifier",
        start: 113,
        end: 114,
        name: "x"
      }
    }
  ]
}, {
  preprocess: true,
  trackComments: true
});*/

// Complex nesting with comment tracking
// This test is turned off as we don't track comments like this currently
// test("x = 0;\n// before #if\n#if 0\n// before 1\nx = 1;\n// after 1\n// before #elif 1\n#elif 1\n    // after #elif 1\n    // before #ifndef FOO\n    #ifndef FOO\n        // after #ifndef FOO\n        x = 7;\n        // after x = 7\n    #else\n        // after #else\n        x = 13;\n        // before inner #endif\n    #endif\n    // after inner #endif\n\n// before 2\nx = 2\n// after 2\n#endif\n\n// after outer #endif\nx;\n", {
//   type: "Program",
//   start: 0,
//   end: 392,
//   body: [
//     {
//       type: "ExpressionStatement",
//       start: 0,
//       end: 6,
//       expression: {
//         type: "AssignmentExpression",
//         start: 0,
//         end: 5,
//         operator: "=",
//         left: {
//           type: "Identifier",
//           start: 0,
//           end: 1,
//           name: "x"
//         },
//         right: {
//           type: "Literal",
//           start: 4,
//           end: 5,
//           value: 0,
//           raw: "0"
//         }
//       },
//       commentsAfter: [
//         "// before #if",
//         "// after #elif 1",
//         "// before #ifndef FOO",
//         "// after #ifndef FOO"
//       ]
//     },
//     {
//       type: "ExpressionStatement",
//       start: 183,
//       end: 189,
//       commentsBefore: [
//         "// before #if",
//         "// after #elif 1",
//         "// before #ifndef FOO",
//         "// after #ifndef FOO"
//       ],
//       expression: {
//         type: "AssignmentExpression",
//         start: 183,
//         end: 188,
//         operator: "=",
//         left: {
//           type: "Identifier",
//           start: 183,
//           end: 184,
//           name: "x"
//         },
//         right: {
//           type: "Literal",
//           start: 187,
//           end: 188,
//           value: 7,
//           raw: "7"
//         }
//       },
//       commentsAfter: [
//         "// after x = 7",
//         "// after inner #endif",
//         "// before 2"
//       ]
//     },
//     {
//       type: "ExpressionStatement",
//       start: 343,
//       end: 348,
//       commentsBefore: [
//         "// after x = 7",
//         "// after inner #endif",
//         "// before 2"
//       ],
//       expression: {
//         type: "AssignmentExpression",
//         start: 343,
//         end: 348,
//         operator: "=",
//         left: {
//           type: "Identifier",
//           start: 343,
//           end: 344,
//           name: "x"
//         },
//         right: {
//           type: "Literal",
//           start: 347,
//           end: 348,
//           value: 2,
//           raw: "2"
//         }
//       },
//       commentsAfter: [
//         "// after 2",
//         "// after outer #endif"
//       ]
//     },
//     {
//       type: "ExpressionStatement",
//       start: 390,
//       end: 392,
//       commentsBefore: [
//         "// after 2",
//         "// after outer #endif"
//       ],
//       expression: {
//         type: "Identifier",
//         start: 390,
//         end: 391,
//         name: "x"
//       }
//     }
//   ]
// }, {
//   preprocess: true,
//   trackComments: true
// });

// Conditional nesting failures
testFail("#if 0\nx = 0;\n",
         "Missing #endif (3:0)", {preprocess: true});

testFail("#if 0\nx = 0;\n#if 1\nx = 1;\n#endif\n",
         "Missing #endif (6:0)", {preprocess: true});

testFail("#if 0\nx = 0;\n#endif\n#endif\n",
         "#endif without #if (4:0)", {preprocess: true});

testFail("#if 0\nx = 0;\n#else\nx = 1;\n#else\nx = 2;\n#endif\n",
         "#else after #else (5:0)", {preprocess: true});

testFail("#if 0\nx = 0;\n#else\nx = 1;\n#elif 1\nx = 2;\n#endif\n",
         "#elsif after #else (5:0)", {preprocess: true});

// 5. Diagnostics

// #error
testFail("#error \"This is \" + \"a test\"\nx = 7;\n",
         "Error: This is a test (1:0)", {preprocess: true});

// #warning
test("#ifndef FOO\n#warning \"This warning should be here: FOO is not defined!\"\n#endif\n", {
  type: "Program",
  start: 0,
  end: 79,
  body: []
}, {
  preprocess: true
});

// 7. Pragmas

// #pragma is accepted but ignored
test("#pragma mark -\nx = 7;\n", {
  type: "Program",
  start: 0,
  end: 22,
  body: [
    {
      type: "ExpressionStatement",
      start: 15,
      end: 21,
      expression: {
        type: "AssignmentExpression",
        start: 15,
        end: 20,
        operator: "=",
        left: {
          type: "Identifier",
          start: 15,
          end: 16,
          name: "x"
        },
        right: {
          type: "Literal",
          start: 19,
          end: 20,
          value: 7,
          raw: "7"
        }
      }
    }
  ]
}, {
  preprocess: true
});

// Test locations in macros. As the parameter generate a macro it will be nested macros in two levels.
test("#define GLOBAL(name) name\n\nGLOBAL(martin) = function(a, b) {\n    return true;\n}", {
  type: "Program",
  start: 0,
  end: 79,
  loc: {
    start: {
      line: 1,
      column: 0
    },
    end: {
      line: 5,
      column: 1
    }
  },
  body: [
    {
      type: "ExpressionStatement",
      start: 34,
      end: 79,
      loc: {
        start: {
          line: 3,
          column: 0
        },
        end: {
          line: 5,
          column: 1
        }
      },
      expression: {
        type: "AssignmentExpression",
        start: 34,
        end: 79,
        loc: {
          start: {
            line: 3,
            column: 0
          },
          end: {
            line: 5,
            column: 1
          }
        },
        operator: "=",
        left: {
          type: "Identifier",
          start: 34,
          end: 40,
          loc: {
            start: {
              line: 3,
              column: 0
            },
            end: {
              line: 3,
              column: 6
            }
          },
          name: "martin"
        },
        right: {
          type: "FunctionExpression",
          start: 44,
          end: 79,
          loc: {
            start: {
              line: 3,
              column: 17
            },
            end: {
              line: 5,
              column: 1
            }
          },
          id: null,
          params: [
            {
              type: "Identifier",
              start: 53,
              end: 54,
              loc: {
                start: {
                  line: 3,
                  column: 26
                },
                end: {
                  line: 3,
                  column: 27
                }
              },
              name: "a"
            },
            {
              type: "Identifier",
              start: 56,
              end: 57,
              loc: {
                start: {
                  line: 3,
                  column: 29
                },
                end: {
                  line: 3,
                  column: 30
                }
              },
              name: "b"
            }
          ],
          body: {
            type: "BlockStatement",
            start: 59,
            end: 79,
            loc: {
              start: {
                line: 3,
                column: 32
              },
              end: {
                line: 5,
                column: 1
              }
            },
            body: [
              {
                type: "ReturnStatement",
                start: 65,
                end: 77,
                loc: {
                  start: {
                    line: 4,
                    column: 4
                  },
                  end: {
                    line: 4,
                    column: 16
                  }
                },
                argument: {
                  type: "Literal",
                  start: 72,
                  end: 76,
                  loc: {
                    start: {
                      line: 4,
                      column: 11
                    },
                    end: {
                      line: 4,
                      column: 15
                    }
                  },
                  value: true,
                  raw: "true"
                }
              }
            ]
          }
        }
      }
    }
  ]
}, {
  preprocess: true,
  locations: true
});
