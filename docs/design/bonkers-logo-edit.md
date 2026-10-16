# Bonkers homepage logo edit

Tool: built-in image generation/editing tool, editing the supplied `bonkerblackjack.png`.
Output: `public/bonkers-logo.png`, PNG with transparency. Original source preserved.

Final prompt:

> Edit target: supplied Bonkers Blackjack raster logo. Precise text removal for a casino homepage logo. Remove ONLY the entire lower word BLACKJACK and the dark backing/gold contour belonging exclusively to that lower word. Keep the orange dog mascot, yellow coin, three red dollar signs, the exact BONKERS lettering, their colors, proportions, style and details unchanged. Finish a clean navy/gold outlined lower edge directly beneath BONKERS so the logo reads only BONKERS. No replacement subtitle or extra text. Tight balanced logo framing with a small clear margin, no cropping any part of the mascot, dollar signs or BONKERS. Return an actual transparent background, no white rectangle and no checkerboard baked into pixels.

The homepage uses the edited logo in its header and hero. Desktop, phone portrait and landscape layouts were checked with the existing public-lobby browser test; the production build and TypeScript checks passed.
