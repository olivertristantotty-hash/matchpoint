# Platform logos for the verify gate

Drop 5 PNG files in this folder before running `npm run setup:emojis`.

## Filenames (required, exact)

| File | Platform | Button label |
|---|---|---|
| `riot.png` | Riot Games | Riot |
| `steam.png` | Steam | Steam |
| `xbox.png` | Xbox | Xbox |
| `playstation.png` | PlayStation | PlayStation |
| `activision.png` | Activision (Call of Duty) | Activision |

## Image requirements

- **Size**: 128x128 recommended (Discord scales them down for buttons)
- **Max file size**: 256 KB (Discord limit)
- **Format**: PNG with transparent background works best
- **Content**: Just the logo — no wordmark, centered, tight crop

## Where to get them

Any of these will give you clean PNG logos:

- https://simpleicons.org/ — free SVG, convert to PNG (Riot, Steam, Xbox, PlayStation, Activision all listed)
- https://worldvectorlogo.com/
- https://brandfetch.com/

## Legal note

Platform logos are trademarks of their owners. Using them as a "link your X account" affordance for a user-initiated OAuth-style flow is nominative fair use — you're indicating which platform the button connects to. Don't use them in a way that suggests endorsement or partnership.

## Running the upload

```bash
npm run setup:emojis
```

The script is idempotent — re-running it will skip emojis that already exist and only upload missing or updated ones.
