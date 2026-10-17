import { sendTestPush } from "./_pushTest.js";

// ADR-0016 step 1, test only: 403 unless PUSH_TEST_ENABLED is "1".
export default {
  fetch(request: Request): Promise<Response> {
    return sendTestPush(request);
  },
};
