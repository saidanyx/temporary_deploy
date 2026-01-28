// src/ui/render.js

function isBenignEditError(err) {
  const msg = String(err?.description || err?.message || "").toLowerCase();

  if (msg.includes("message is not modified")) return true;
  if (msg.includes("query is too old")) return true;

  return false;
}

function isCantEditError(err) {
  const msg = String(err?.description || err?.message || "").toLowerCase();

  if (msg.includes("message can't be edited")) return true;
  if (msg.includes("message to edit not found")) return true;
  if (msg.includes("there is no message to edit")) return true;

  // ✅ IMPORTANT: when trying to edit text for a media message
  if (msg.includes("there is no text in the message to edit")) return true;
  if (msg.includes("message is not modified")) return true;

  return false;
}

/**
 * Universal screen renderer.
 * - Prefer editing the existing message
 * - If can't edit, fallback to reply
 */
async function render(ctx, { photo, caption, keyboard, edit = true }) {
  const replyMarkup = keyboard;

  // -------- TEXT ONLY --------
  if (!photo) {
    if (edit) {
      // 1) try edit text
      try {
        await ctx.editMessageText(caption || "OK", {
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        });
        return;
      } catch (err) {
        if (isBenignEditError(err)) return;

        // 2) if original message is media (photo), edit caption instead
        try {
          await ctx.editMessageCaption(caption || "OK", {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          });
          return;
        } catch (err2) {
          if (isBenignEditError(err2)) return;

          // 3) if we truly can't edit — fallback to reply
          if (!isCantEditError(err) && !isCantEditError(err2)) {
            // unknown error — still fallback to reply (better UX than silence)
          }
        }
      }
    }

    await ctx.reply(caption || "OK", {
      parse_mode: "Markdown",
      reply_markup: replyMarkup,
    });
    return;
  }

  // -------- WITH PHOTO --------
  const media = {
    type: "photo",
    media: photo,
    caption: caption || "",
    parse_mode: "Markdown",
  };

  if (edit) {
    // 1) try edit media
    try {
      await ctx.editMessageMedia(media, { reply_markup: replyMarkup });
      return;
    } catch (err) {
      if (isBenignEditError(err)) return;

      // 2) sometimes can't edit media but can edit caption
      try {
        await ctx.editMessageCaption(caption || "", {
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        });
        return;
      } catch (err2) {
        if (isBenignEditError(err2)) return;

        // if can't edit — reply
        if (!isCantEditError(err2) && !isCantEditError(err)) {
          // unknown error — still reply
        }
      }
    }
  }

  await ctx.replyWithPhoto(photo, {
    caption: caption || "",
    parse_mode: "Markdown",
    reply_markup: replyMarkup,
  });
}

module.exports = { render };
