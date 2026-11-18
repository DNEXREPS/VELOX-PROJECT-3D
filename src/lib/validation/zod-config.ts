import { z } from "zod";

/**
 * Zod 4 probes `new Function("")` to decide whether it may JIT-compile parsers. The
 * probe is caught, but under our strict CSP (no 'unsafe-eval') browsers still report it
 * as a `securitypolicyviolation`. Jitless mode skips the probe; parsing stays identical.
 * Imported by every module that defines schemas, and by the root client providers.
 */
z.config({ jitless: true });

export {};
