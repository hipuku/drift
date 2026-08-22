/**
 * Test setup, run once before every file.
 *
 * jsdom is pinned to ^29 on purpose. jsdom 30 pulls an undici that needs Node
 * 22 and dies with `webidl.util.markAsUncloneable is not a function`.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library auto-cleans only when it can detect the test framework's
// globals at import time. Doing it explicitly means a leaked component from
// one test cannot satisfy a query in the next and hide a failure.
afterEach(cleanup);
