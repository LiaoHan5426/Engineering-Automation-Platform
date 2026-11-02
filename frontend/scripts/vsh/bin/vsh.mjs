#!/usr/bin/env node
import { run } from '../src/index.ts'
process.exitCode = await run(process.argv[2])
