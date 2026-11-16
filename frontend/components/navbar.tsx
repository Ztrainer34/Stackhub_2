import NavBarContent from "./navbar-content";

interface User {
  id: string;
  username: string;
  is_admin?: boolean;
}

interface NavBarProps {
  user: User | null;
}

export default async function NavBar({ user }: NavBarProps) {
  return <NavBarContent user={user} />;
}
