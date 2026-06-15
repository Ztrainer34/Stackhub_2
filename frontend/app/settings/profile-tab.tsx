"use client";

import { useState, useEffect, FormEvent } from "react";
import { User, AtSign, Mail, Link as LinkIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth } from "@/lib/queries/use-auth";
import { useUpdateProfile } from "@/lib/queries/use-profile-actions";
import { createClient } from "@/utils/supabase/client";

export function ProfileTab() {
  const auth = useAuth();
  const updateProfile = useUpdateProfile();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const getEmail = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser?.email) {
        setEmail(authUser.email);
      }
    };
    getEmail();
  }, []);

  if (auth.isLoading || auth.data?.status !== 'authenticated') {
    return <div>Loading...</div>;
  }

  const user = auth.data.user;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const username = formData.get("username") as string;
    const bio = formData.get("bio") as string;
    const website = formData.get("website") as string;

    // Only send changed fields
    const updates: { username?: string; bio?: string; website?: string } = {};

    if (username && username !== user.username) {
      updates.username = username;
    }

    if (bio !== undefined && bio.trim() !== "") {
      updates.bio = bio;
    }

    if (website !== undefined && website.trim() !== "") {
      updates.website = website;
    }

    if (Object.keys(updates).length > 0) {
      updateProfile.mutate(updates);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Picture Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Picture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <UserAvatar user={user} size="lg" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">Profile picture via Gravatar</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your profile picture is managed through{" "}
                <a
                  href="https://gravatar.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Gravatar
                </a>
                . Update your avatar there using your email.
              </p>
              <a
                href="https://gravatar.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm">
                  Manage on Gravatar
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="username" className="flex items-center gap-2">
                  <AtSign className="w-4 h-4" />
                  Username
                </Label>
                <Input
                  id="username"
                  name="username"
                  defaultValue={user.username}
                  placeholder="Enter your username"
                  minLength={3}
                />
              </div>
              <div>
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  disabled
                  placeholder="Enter your email"
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Email is managed through your account settings
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={user.bio || ""}
                placeholder="Tell us about yourself..."
                rows={3}
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Brief description for your profile (max 500 characters)
              </p>
            </div>

            <div>
              <Label htmlFor="website" className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                Website
              </Label>
              <Input
                id="website"
                name="website"
                type="url"
                defaultValue={user.website || ""}
                placeholder="https://your-website.com"
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
