import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database"
  },
  pages: {
    signIn: "/"
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""
    })
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const email = user.email.trim().toLowerCase();

      const membership = await prisma.storeMembership.findFirst({
        where: {
          active: true,
          user: {
            email,
            active: true
          }
        }
      });

      if (membership) return true;

      const invitation = await prisma.storeInvitation.findFirst({
        where: {
          email,
          acceptedAt: null,
          expiresAt: {
            gt: new Date()
          }
        }
      });

      return Boolean(invitation);
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.name = user.name;
        session.user.email = user.email;
        session.user.image = user.image;
      }

      return session;
    }
  }
};
