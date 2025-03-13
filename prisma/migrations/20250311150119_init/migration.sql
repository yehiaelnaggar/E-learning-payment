-- CreateTable
CREATE TABLE "stripeAccount" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "stripeAccountLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripeAccount_pkey" PRIMARY KEY ("id")
);
