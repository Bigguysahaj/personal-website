import { readFileSync } from "node:fs";
import { join } from "node:path";
import About from "@/components/About";
import Contact from "@/components/Contact";
import Hero from "@/components/Hero";
import Nav from "@/components/Nav";
import Palletizer from "@/components/Palletizer";
import Projects from "@/components/Projects";

export default function Home() {
  return (
    <>
      <Nav />
      <Hero
        controllerSource={readFileSync(join(process.cwd(), "public/letter-controller.cpp"), "utf8")}
        simulationSource={readFileSync(join(process.cwd(), "components/Hero.tsx"), "utf8")}
      />
      <main>
        <Palletizer />
        <Projects />
        <About />
        <Contact />
      </main>
    </>
  );
}
