import { utils } from "bahamut-automation";
import { authenticator } from "otplib";
import { MAIN_FRAME, solve } from "recaptcha-solver";
const { wait_for_cloudflare } = utils;
var login_default = {
  name: "Login",
  description: "\u767B\u5165",
  run: async ({ page, params, shared, logger }) => {
    let success = false;
    await page.goto("https://www.gamer.com.tw/");
    await wait_for_cloudflare(page);
    const max_attempts = +params.max_attempts || +shared.max_attempts || 3;
    for (let i = 0; i < max_attempts; i++) {
      try {
        logger.log("\u6B63\u5728\u6AA2\u6E2C\u767B\u5165\u72C0\u614B");
        await page.goto("https://www.gamer.com.tw/");
        await page.waitForTimeout(1e3);
        let not_login_signal = await page.$("div.TOP-my.TOP-nologin");
        if (not_login_signal) {
          await page.goto("https://user.gamer.com.tw/login.php");
          logger.log("\u767B\u5165\u4E2D ...");
          const precheck = page.waitForResponse(
            (res) => res.url().includes("login_precheck.php")
          );
          const uid_locator = page.locator("#form-login input[name=userid]");
          const pw_locator = page.locator("#form-login input[type=password]");
          await uid_locator.fill(params.username);
          await pw_locator.fill(params.password);
          await precheck;
          await check_2fa(page, params.twofa, logger);
          if (await page.isVisible(MAIN_FRAME)) {
            await solve(page).catch((err) => logger.info(err.message));
          }
          await page.click("#form-login #btn-login");
          await page.waitForNavigation({ timeout: 3e3 });
        } else {
          logger.log("\u767B\u5165\u72C0\u614B: \u5DF2\u767B\u5165");
          success = true;
          break;
        }
      } catch (err) {
        logger.error("\u767B\u5165\u6642\u767C\u751F\u932F\u8AA4\uFF0C\u91CD\u65B0\u5617\u8A66\u4E2D", err);
      }
    }
    if (success) {
      shared.flags.logged = true;
    }
    return { success };
  }
};
async function check_2fa(page, twofa, logger) {
  const enabled = await page.isVisible("#form-login #input-2sa");
  if (enabled) {
    logger.log("\u6709\u555F\u7528 2FA");
    if (!twofa) {
      throw new Error("\u672A\u63D0\u4F9B 2FA \u7A2E\u5B50\u78BC");
    }
    const code = authenticator.generate(twofa);
    await page.fill("#form-login #input-2sa", code);
    // await page.evaluate(() => document.forms[0].submit());
  } else {
    logger.log("\u6C92\u6709\u555F\u7528 2FA");
  }
}
export {
  login_default as default
};
