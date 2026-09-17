import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPanel } from "../src/components/AuthPanel";
import { user } from "./fixtures";

const { login, register } = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock("../src/services/auth", () => ({
  login,
  register,
}));

function renderAuth(
  mode: "login" | "register",
  onAuthenticated = vi.fn(),
) {
  const path = mode === "register" ? "/register" : "/sign-in";
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/sign-in"
          element={<AuthPanel mode="login" onAuthenticated={onAuthenticated} />}
        />
        <Route
          path="/register"
          element={
            <AuthPanel mode="register" onAuthenticated={onAuthenticated} />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("signs in and reports the authenticated user", async () => {
    login.mockResolvedValue(user);
    const onAuthenticated = vi.fn();
    const view = userEvent.setup();
    renderAuth("login", onAuthenticated);

    await view.type(screen.getByLabelText("Email"), "m@example.com");
    await view.type(screen.getByLabelText("Password"), "password1");
    await view.click(screen.getByRole("button", { name: "Sign in" }));

    expect(login).toHaveBeenCalledWith({
      email: "m@example.com",
      password: "password1",
    });
    expect(onAuthenticated).toHaveBeenCalledWith(user);
    expect(
      screen.queryByText("Continue to your review dashboard."),
    ).not.toBeInTheDocument();
  });

  it("registers a new account after switching modes", async () => {
    register.mockResolvedValue(user);
    const onAuthenticated = vi.fn();
    const view = userEvent.setup();
    renderAuth("login", onAuthenticated);

    await view.click(
      screen.getByRole("link", { name: "Create a new account" }),
    );
    expect(screen.getByRole("heading", { name: "Create an account" })).toBeInTheDocument();
    expect(screen.queryByText("New account")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Save lessons securely and access them from your dashboard.",
      ),
    ).not.toBeInTheDocument();

    await view.type(screen.getByLabelText("Name"), "M");
    await view.type(screen.getByLabelText("Email"), "m@example.com");
    await view.type(screen.getByLabelText("Password"), "password1");
    await view.type(screen.getByLabelText("Confirm password"), "password1");
    await view.click(screen.getByRole("button", { name: "Sign up" }));

    expect(register).toHaveBeenCalledWith({
      name: "M",
      email: "m@example.com",
      password: "password1",
    });
    expect(onAuthenticated).toHaveBeenCalledWith(user);
  });

  it("rejects registration when passwords do not match", async () => {
    const onAuthenticated = vi.fn();
    const view = userEvent.setup();
    renderAuth("register", onAuthenticated);

    await view.type(screen.getByLabelText("Name"), "M");
    await view.type(screen.getByLabelText("Email"), "m@example.com");
    await view.type(screen.getByLabelText("Password"), "password1");
    await view.type(screen.getByLabelText("Confirm password"), "password2");
    await view.click(screen.getByRole("button", { name: "Sign up" }));

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("registers when password and confirm password match", async () => {
    register.mockResolvedValue(user);
    const onAuthenticated = vi.fn();
    const view = userEvent.setup();
    renderAuth("register", onAuthenticated);

    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();

    await view.type(screen.getByLabelText("Name"), "M");
    await view.type(screen.getByLabelText("Email"), "m@example.com");
    await view.type(screen.getByLabelText("Password"), "password1");
    await view.type(screen.getByLabelText("Confirm password"), "password1");
    await view.click(screen.getByRole("button", { name: "Sign up" }));

    expect(register).toHaveBeenCalledWith({
      name: "M",
      email: "m@example.com",
      password: "password1",
    });
    expect(onAuthenticated).toHaveBeenCalledWith(user);
  });

  it("hides confirm password on sign in and shows it on register", async () => {
    renderAuth("login");
    expect(
      screen.queryByLabelText("Confirm password"),
    ).not.toBeInTheDocument();

    const view = userEvent.setup();
    await view.click(
      screen.getByRole("link", { name: "Create a new account" }),
    );
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("toggles visibility for password and confirm password together", async () => {
    const view = userEvent.setup();
    renderAuth("register");

    const password = screen.getByLabelText("Password");
    const confirmPassword = screen.getByLabelText("Confirm password");
    expect(password).toHaveAttribute("type", "password");
    expect(confirmPassword).toHaveAttribute("type", "password");

    await view.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(confirmPassword).toHaveAttribute("type", "text");

    await view.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    expect(confirmPassword).toHaveAttribute("type", "password");
  });

  it("switches from register back to sign in", async () => {
    const view = userEvent.setup();
    renderAuth("register");

    await view.click(
      screen.getByRole("link", { name: "Already have an account? Sign in" }),
    );
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows API errors and non-Error failures", async () => {
    login.mockRejectedValueOnce(new Error("Invalid email or password."));
    const view = userEvent.setup();
    renderAuth("login");

    await view.type(screen.getByLabelText("Email"), "m@example.com");
    await view.type(screen.getByLabelText("Password"), "password1");
    await view.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Invalid email or password.")).toBeInTheDocument();

    login.mockRejectedValueOnce("offline");
    await view.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Authentication failed.")).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const view = userEvent.setup();
    renderAuth("login");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    await view.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    await view.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });
});
