import WelcomeMail from "./emails/welcome";
import { render } from "@react-email/render";
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { exit } from "process";

const renderMail = async (component: any, output: string) => {
    const html = await render(React.createElement(component));
    const htmlEncoded = new Uint8Array(Buffer.from(html));
    fs.writeFile(
      path.join("./generated/", output),
      htmlEncoded,
      (err) => {
        if (err) {
            console.log(err);
            exit(1);
        }
      }
    );
};

renderMail(WelcomeMail, "welcome.html");
