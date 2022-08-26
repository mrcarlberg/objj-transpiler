if (typeof exports !== "undefined") {
    var test = require("./driver.js").test;
    var testFail = require("./driver.js").testFail;
  }

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

// identifier before message send is invalid.
testFail("kalle [a a]", "Expected a semicolon (1:6)", {ecmaVersion: 8, objj: true})