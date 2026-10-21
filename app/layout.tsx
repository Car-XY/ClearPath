import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"ClearPath — Make room for easier movement",description:"Try the arrangement before moving the furniture. An editable 3D room planner with personal movement preferences and live path checks.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
