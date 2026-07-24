"use client";

import {
  User,
  Shield,
  Bell,
  Palette,
  Key,
  Cookie,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ProfileTab } from "./profile-tab";
import { CookieSettings } from "./cookie-settings";

function AccountTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Account Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Password</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Manage your account password and security settings
            </p>
            <Button variant="outline">
              Change Password
            </Button>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-medium mb-2">Two-Factor Authentication</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Add an extra layer of security to your account
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Disabled</Badge>
                <span className="text-sm">Not configured</span>
              </div>
              <Button variant="outline">
                Enable 2FA
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Manage your API keys for third-party integrations
          </p>
          <Button variant="outline">
            Generate API Key
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Configure how you want to receive notifications
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Email Notifications</h4>
                <p className="text-sm text-muted-foreground">
                  Receive notifications via email
                </p>
              </div>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Push Notifications</h4>
                <p className="text-sm text-muted-foreground">
                  Receive push notifications in your browser
                </p>
              </div>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AppearanceTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Theme Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Customize the appearance of your interface
          </p>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Color Theme</h4>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" className="h-20 flex-col">
                  <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-300 mb-2"></div>
                  <span className="text-sm">Light</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col">
                  <div className="w-8 h-8 rounded-full bg-gray-900 mb-2"></div>
                  <span className="text-sm">Dark</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 mb-2"></div>
                  <span className="text-sm">System</span>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account settings and preferences
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Account
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Appearance
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-2">
              <Cookie className="w-4 h-4" />
              Privacy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab />
          </TabsContent>

          <TabsContent value="account">
            <AccountTab />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab />
          </TabsContent>

          <TabsContent value="privacy">
            <CookieSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}