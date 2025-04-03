import { utils } from "bahamut-automation";
import { authenticator } from "otplib";
import { MAIN_FRAME, solve } from "recaptcha-solver";

const { wait_for_cloudflare } = utils;

var login_default = {
  name: "Login",
  description: "登入",
  run: async ({ page, params, shared, logger }) => {
    let success = false;
    await page.goto("https://www.gamer.com.tw/");
    await wait_for_cloudflare(page);

    const max_attempts = +params.max_attempts || +shared.max_attempts || 3;

    for (let i = 0; i < max_attempts; i++) {
      try {
        logger.log("正在檢測登入狀態");
        await page.goto("https://www.gamer.com.tw/");
        await page.waitForTimeout(1000);

        // 嘗試關閉可能出現的彈出視窗
        await page
          .waitForSelector("#driver-popover-content > button", { timeout: 5000 })
          .then(async (el) => {
            await el.click();
            logger.log("關閉了彈出視窗");
          })
          .catch((err) => {
            logger.warn("無法找到或點擊彈出視窗按鈕，可能已被關閉: " + err.message);
          });

        // 檢測是否已登入
        let not_login_signal = await page.waitForSelector("img.main-nav__profile", { timeout: 5000 }).catch(() => null);
        if (!not_login_signal) {
          logger.warn("無法找到登入圖示，可能網站有變更");
        } else {
          const profileImgSrc = (await not_login_signal.getAttribute("src")) || "";
          if (!profileImgSrc.includes("none.gif")) {
            logger.log("登入狀態: 已登入");
            success = true;
            break;
          }
        }

        // 開始登入流程
        await page.goto("https://user.gamer.com.tw/login.php");
        logger.log("登入中 ...");

        const precheck = page.waitForResponse(
          (res) => res.url().includes("login_precheck.php")
        );

        const uid_locator = page.locator("#form-login input[name=userid]");
        const pw_locator = page.locator("#form-login input[type=password]");

        await uid_locator.fill(params.username);
        await pw_locator.fill(params.password);

        await precheck;

        try {
          await check_2fa(page, params.twofa, logger);
        } catch (err) {
          logger.error("2FA 驗證失敗: " + err.message);
          continue;
        }

        if (await page.isVisible(MAIN_FRAME)) {
          const solved = await solve(page).catch((err) => {
            logger.error("reCAPTCHA 解決失敗: " + err.message);
            return false;
          });

          if (!solved) {
            throw new Error("無法通過 reCAPTCHA 驗證");
          }
        }

        await page.click("#form-login #btn-login");

        try {
          await page.waitForNavigation({ timeout: 5000 });
        } catch (err) {
          logger.warn("頁面加載超時，但可能已成功登入");
        }

        // 再次檢查登入狀態
        await page.goto("https://www.gamer.com.tw/");
        await page.waitForTimeout(1000);
        not_login_signal = await page.waitForSelector("img.main-nav__profile", { timeout: 5000 }).catch(() => null);

        if (not_login_signal) {
          const profileImgSrc = (await not_login_signal.getAttribute("src")) || "";
          if (!profileImgSrc.includes("none.gif")) {
            logger.log("成功登入");
            success = true;
            break;
          }
        }
      } catch (err) {
        logger.error("登入時發生錯誤，重新嘗試中", err);
      }
    }

    if (success) {
      shared.flags.logged = true;
    }

    return { success };
  },
};

async function check_2fa(page, twofa, logger) {
  const enabled = await page.isVisible("#form-login #input-2sa");

  if (enabled) {
    logger.log("已啟用 2FA");

    if (!twofa) {
      throw new Error("未提供 2FA 種子碼");
    }

    const code = authenticator.generate(twofa);
    await page.fill("#form-login #input-2sa", code);
    await page.evaluate(() => document.forms[0].submit());
  } else {
    logger.log("未啟用 2FA");
  }
}

export { login_default as default };
