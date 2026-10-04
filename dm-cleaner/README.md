<div align="center">

# 💬 DM Cleaner

**Delete every message you sent in a DM.**

[Back to home](../README.md)

</div>

## Features

- **Auto-detects the DM** you are currently viewing, no channel ID needed
- **Paginated fetch** until every message of yours is loaded
- **Adaptive rate limiting** that grows on 429 and shrinks on success
- **Live ETA** with smoothing
- **Live speed** in messages per second
- **Cancel anytime**, deleted messages stay deleted
- **Safe filter**, only deletes `DEFAULT`, `REPLY`, and `SLASH` messages

## Installation

1. Open the DM you want to clean
2. Press `F12`, then open the **Console** tab
3. Copy the content of [`dm-cleaner.js`](dm-cleaner.js)
4. Paste and press Enter

The tool launches automatically on the current DM. You can also target a channel manually:

```js
run('1234567890123456789');
```

## Flow

1. The script reads the DM you are viewing
2. It fetches all your messages in that DM
3. A confirmation popup shows the total
4. Messages are deleted one by one with a live overlay

## How it works

```js
GET    https://discord.com/api/v10/channels/{id}/messages?limit=100&before={last_id}
DELETE https://discord.com/api/v10/channels/{id}/messages/{msg_id}
```

### Adaptive delay

Bulk deleting hits Discord's rate limiter fast. The script uses a class that:

- Starts conservative, longer delay for bigger jobs
- On every success, removes 20 ms from the delay and 10 ms from the floor
- On every 429, adds 400 ms to the floor and waits at least `retry_after + 800 ms`

After a slow start, it settles at the fastest safe rhythm.

## FAQ

**Do other members see the deletion?**
Yes. Deleted messages disappear for everyone. There is no delete-for-me-only in the DM API.

**Can I recover a deleted message?**
No. Deletion is permanent.

**Why is it slow?**
Discord rate-limits message deletion aggressively. The adaptive delay keeps you under the limit, which caps the speed at roughly one message per second.

**Can I clean a 10,000-message DM?**
Yes. Expect it to take over an hour. Keep the tab open and let it run.

---

[Back to home](../README.md) · [MIT License](../LICENSE)