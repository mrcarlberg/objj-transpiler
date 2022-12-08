#!/usr/bin/env node

import path from 'path'
import fs from 'fs'
import { compile } from '../dist/objj-transpiler.cjs'

let infile; let compiled; const options = {}; const acornOptions = {ecmaVersion: 2022}; let silent = false; let code = true; let map = false; let ast = false; let output; let outputFilename

// TODO: Fix options
function help (status) {
  console.log('usage: ' + path.basename(process.argv[1]) + ' infile [--ecma5|--ecma8] [--strict-semicolons] [--track-comments]')
  console.log('        [--include-comments] [--include-comment-line-break] [--no-allow-trailing-commas]')
  console.log('        [(-o | --output) <path>')
  console.log('        [--indent-tab] [--indent-width <n>] [--indent-string <string>]')
  console.log('        [--track-spaces] [--track-locations] [--no-objj] [--no-preprocess] [--old-safari-bug]')
  console.log('        [--no-debug-symbols] [--no-type-signatures] [--no-inline-msgsend]')
  console.log('        [--source-map] [--ast] [--no-code]')
  console.log('        [-Dmacro[([p1, p2, ...])][=definition]] [--silent] [--help]')
  process.exit(status)
}

// We skip the high number unicode whitespaces and only allow regular extended ASCII codes
function isWhiteSpace (tok) {
  return ((tok < 14 && tok > 8) || tok === 32 || tok === 160)
}

function defineMacro (macro) {
  if (!options.macros) { options.macros = Object.create(null) }

  const split = macro.split('=')
  const nameAndArgs = split.shift()
  const splitNameAndArgs = nameAndArgs.split('(')
  const name = splitNameAndArgs[0].trim()
  const args = splitNameAndArgs[1]
  const definition = split.join('=')

  if (args) {
    let pos = 0
    let start
    let token = args.charCodeAt(pos)
    const parameterNames = []

    // Skip whitespaces
    while (!isNaN(token) && isWhiteSpace(token)) { token = args.charCodeAt(++pos) }
    start = pos
    // Will go until end or ')'
    while (!isNaN(token) && token !== 41) { // ')'
      // Will go until end, ')', comma or whitespace
      while (!isNaN(token) && token !== 41 && token !== 44 && !isWhiteSpace(token)) { // ')', ',' or whitespace
        token = args.charCodeAt(++pos)
      }
      // Get parameter identifier
      parameterNames.push(args.slice(start, pos))
      // Skip whitespaces and comma
      while (!isNaN(token) && (isWhiteSpace(token) || token === 44)) { token = args.charCodeAt(++pos) }
      start = pos
    }
  }
  options.macros[name] = new compiler.acorn.Macro(name, definition, parameterNames)
}

for (let i = 2; i < process.argv.length; ++i) {
  const arg = process.argv[i]
  if (arg === '--module') acornOptions.sourceType = 'module'
  else if (arg === '--ecma5') acornOptions.ecmaVersion = 5
  else if (arg === '--ecma8') acornOptions.ecmaVersion = 8
  else if (arg === '--loose') acornOptions.loose = true
  else if (arg === '--preserve-paren') acornOptions.preserveParen = true
  else if (arg === '--latest') acornOptions.ecmaVersion = 'latest'
  else if (arg === '--strict-semicolons') acornOptions.strictSemicolons = true
  else if (arg === '--no-allow-trailing-commas') acornOptions.allowTrailingCommas = false
  else if (arg === '--track-comments') acornOptions.trackComments = true
  else if (arg === '--include-comment-line-break') acornOptions.trackCommentsIncludeLineBreak = true
  else if (arg === '--include-comments') {
    options.includeComments = true
    acornOptions.trackComments = true
  } else if (arg === '--track-spaces') acornOptions.trackSpaces = true
  else if (arg === '--track-locations') acornOptions.locations = true
  else if (arg === '--no-objj') acornOptions.objj = false
  else if (arg === '--no-preprocess') acornOptions.preprocess = false
  else if (arg === '--silent') silent = true
  else if (arg === '--old-safari-bug') options.transformNamedFunctionDeclarationToAssignment = true
  else if (arg === '--no-code') code = false
  else if (arg === '--ast') ast = true
  else if (arg === '--source-map') {
    map = true
    options.sourceMap = true
  } else if (arg === '--no-debug-symbols') options.includeDebugSymbols = false
  else if (arg === '--no-type-signatures') options.includeTypeSignatures = false
  else if (arg === '--no-inline-msgsend') options.inlineMsgSendFunctions = false
  else if (arg === '--indent-width') options.indentationSpaces = parseInt(process.argv[++i])
  else if (arg === '--indent-string') {
    if (options.indentationType) {
      console.log("Can't have both '--indent-string' and '--indent-tab'")
      help(1)
    } else { options.indentationType = process.argv[++i] }
  } else if (arg === '--indent-tab') {
    if (options.indentationType) {
      console.log("Can't have both '--indent-string' and '--indent-tab'")
      help(1)
    } else {
      options.indentationType = '\t'
      if (!options.indentationSpaces) options.indentationSpaces = 1
    }
  } else if (arg === '--output' || arg === '-o') output = process.argv[++i]
  else if (arg.substring(0, 2) === '-D') defineMacro(arg.substring(2))
  else if (arg === '--help') help(0)
  else if (arg[0] === '-') help(1)
  else infile = arg
}

if (!infile) help(1)

if (options.includeComments && !options.formatDescription) {
  console.log("Must have '--formatter' when using '--include-comments'")
  help(1)
}
if (options.generateObjJ && !options.formatDescription) {
  console.log("Must have '--formatter' when using '--generate-objj'")
  help(1)
}

if (output) {
  const relative = output.substring(0, 1) !== '/'
  const absolutePath = relative ? path.resolve(process.cwd(), output) : output

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) { outputFilename = path.join(absolutePath, path.basename(infile, path.extname(infile))) } else { outputFilename = path.join(path.dirname(absolutePath), path.basename(absolutePath, path.extname(absolutePath))) }
}

let anyErrors = false

try {
  const source = fs.readFileSync(infile, 'utf8')

  if (Object.keys(acornOptions).length !== 0) { options.acornOptions = acornOptions }

  // console.log(compiler);
  compiled = compile(source, infile, options)

  for (let i = 0; i < compiled.warningsAndErrors.length; i++) {
    const warning = compiled.warningsAndErrors[i]
    const message = compiled.prettifyMessage(warning)

    const warningIsError = warning.messageType === 'ERROR'

    // Set anyErrors to 'true' if there are any errors in the list
    anyErrors = anyErrors || warningIsError;
    (warningIsError ? console.error : console.log)(message)
  }
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

const writeToConsole = !silent && !output

if (code) {
  const generatedCode = compiled.code()
  if (generatedCode) {
    if (writeToConsole) console.log(generatedCode)
    if (output) fs.writeFileSync(outputFilename + '.js', generatedCode)
  } else {
    console.error('<No code generated>')
  }
}

if (map) {
  const generatedMap = compiled.map()
  if (generatedMap) {
    if (writeToConsole) console.log(generatedMap)
    if (output) fs.writeFileSync(outputFilename + '.map', generatedMap)
  } else {
    console.error('<No sourcemap generated>')
  }
}

if (ast) {
  const generatedAst = compiled.ast()
  if (generatedAst) {
    if (writeToConsole) console.log(generatedAst)
    if (output) fs.writeFileSync(outputFilename + '.ast', generatedAst)
  } else {
    console.error('<No ast generated>')
  }
}

process.exit(anyErrors ? 1 : 0)
