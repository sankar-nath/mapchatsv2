import { FC } from "react";

type NavbarProps = {
  onOpenSidebar: () => void;   // <-- add prop
};

export const Navbar: FC<NavbarProps> = ({ onOpenSidebar }) => {
  return (
    <div className="flex h-[50px] sm:h-[60px] border-b border-neutral-300 py-2 px-2 sm:px-8 items-center justify-between">
      <div className="font-bold text-3xl flex items-center">
        <a
          className="ml-2 hover:opacity-50"
          href=""
        >
          Chat with Maps
        </a>
      </div>

      {/* Mobile menu button */}
      <button 
        className="sm:hidden p-2"
        onClick={onOpenSidebar}   // <-- call the prop
      >
        ☰
      </button>
    </div>
  );
};
