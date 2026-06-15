import { ReactNode } from "react";
import { PostCreationForm } from "./form";
import { Separator } from "@radix-ui/react-select";
import { getServerAuthState } from "@/lib/auth-server";
import { redirect } from "next/navigation";

function TypographyH1({ children }: { children: ReactNode }) {
  return (
    <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
      {children}
    </h1>
  );
}

function TypographyP({ children }: { children: ReactNode }) {
  return <p className="leading-7 [&:not(:first-child)]:mt-6">{children}</p>;
}

export default async function New() {
  const authState = await getServerAuthState();

  if (authState.status !== 'authenticated') {
    redirect(authState.status === 'unauthenticated' ? "/login" : "/");
  }

  const user = authState.user;

  return (
    <div className="px-10 py-10 mt-10 max-w-3xl mr-auto ml-auto">
      <TypographyH1>Create a new Post</TypographyH1>
      <TypographyP>
        A playbook explains how to use a tool to achieve a particular goal. A
        combo does the same; with multiple tools. Want to re-use part of a
        playbook that someone has written ? You can fork it.
      </TypographyP>

      <Separator className="my-5" />

      <div className="my-5">
        <PostCreationForm user={user} type="playbook" />
      </div>
    </div>
  );
}
