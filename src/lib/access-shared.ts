export type AppAccess = {
  userId: string;
  storeId: string;
  name: string;
  email: string;
  image: string | null;
  role: "manager" | "employee";
};
