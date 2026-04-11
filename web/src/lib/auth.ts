import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID!,
      clientSecret: process.env.AUTH_DISCORD_SECRET!,
      authorization: { params: { scope: "identify email" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.discordId = (profile as any).id;
        token.username = (profile as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).discordId = token.discordId;
      (session as any).username = token.username;
      return session;
    },
  },
});
