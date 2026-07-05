import { Badge, Button, Card, createTheme } from "@mantine/core";

/**
 * Cal.com (app.cal.eu) inspired theme:
 * neutral grays, near-black primary, subtle radii, uppercase-free badges.
 */
export const theme = createTheme({
  primaryColor: "dark",
  defaultRadius: "md",

  headings: {
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "1.75rem", lineHeight: "1.3" },
      h2: { fontSize: "1.375rem", lineHeight: "1.35" },
      h3: { fontSize: "1.125rem", lineHeight: "1.4" },
    },
  },

  components: {
    Button: Button.extend({
      defaultProps: { size: "sm" },
      styles: { root: { fontWeight: 500 } },
    }),

    Card: Card.extend({
      defaultProps: { withBorder: true, radius: "md" },
    }),

    Badge: Badge.extend({
      defaultProps: { variant: "light", color: "gray", radius: "sm" },
      styles: { root: { textTransform: "none", fontWeight: 500 } },
    }),
  },
});
