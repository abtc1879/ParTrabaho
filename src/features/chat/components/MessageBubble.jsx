function readSingle(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function initialsFromName(name, fallback) {
  if (!name) return fallback;
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || fallback
  );
}

const urlRegex = /https?:\/\/[^\s]+/g;

function trimTrailingPunctuation(value) {
  const trimmed = value.replace(/[)\].,!?;:]+$/g, "");
  const trailing = value.slice(trimmed.length);
  return { url: trimmed, trailing };
}

function isImageUrl(url) {
  const cleanUrl = url.split("?")[0] || "";
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(cleanUrl);
}

function parseMessageBody(body) {
  if (!body) return { tokens: [], images: [] };
  const tokens = [];
  const images = [];
  urlRegex.lastIndex = 0;
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    const { url, trailing } = trimTrailingPunctuation(match[0]);
    if (url) {
      if (isImageUrl(url)) {
        images.push(url);
      } else {
        tokens.push({ type: "link", value: url });
      }
    } else {
      tokens.push({ type: "text", value: match[0] });
    }
    if (trailing) {
      tokens.push({ type: "text", value: trailing });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    tokens.push({ type: "text", value: body.slice(lastIndex) });
  }

  return { tokens, images };
}

export function MessageBubble({ mine, message }) {
  const sender = readSingle(message.sender);
  const senderName = [sender?.firstname, sender?.surname].filter(Boolean).join(" ").trim();
  const fallbackLabel = mine ? "ME" : "PT";
  const senderInitials = initialsFromName(senderName, fallbackLabel);
  const body = message.body || "";
  const { tokens, images } = parseMessageBody(body);
  const hasText = tokens.some((token) => (token.type === "link" ? true : token.value.trim().length > 0));

  return (
    <div className={`message-row ${mine ? "mine" : ""}`}>
      <span className="message-avatar" aria-hidden="true">
        {sender?.avatar_url ? (
          <img className="message-avatar-img" src={sender.avatar_url} alt={senderName || "User"} />
        ) : (
          senderInitials
        )}
      </span>
      <div className="message-bubble">
        {hasText ? (
          <p>
            {tokens.map((token, index) =>
              token.type === "link" ? (
                <a
                  key={`${token.value}-${index}`}
                  className="message-link"
                  href={token.value}
                  target="_blank"
                  rel="noreferrer"
                >
                  {token.value}
                </a>
              ) : (
                <span key={`${token.value}-${index}`}>{token.value}</span>
              )
            )}
          </p>
        ) : null}
        {images.length > 0 ? (
          <div className="message-media">
            {images.map((url, index) => (
              <figure key={`${url}-${index}`} className="message-image">
                <img src={url} alt="Shared upload" loading="lazy" />
                <figcaption>
                  <a className="message-link" href={url} target="_blank" rel="noreferrer">
                    Open image
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        <time>{new Date(message.created_at).toLocaleTimeString()}</time>
      </div>
    </div>
  );
}
