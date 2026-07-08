import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

// jsdom has no Web Audio API, so stub a minimal AudioContext.
class FakeAudioContext {
  state: AudioContextState = "suspended";
  currentTime = 0;
  destination = {};
  createGain() {
    return {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createOscillator() {
    return {
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
  }
  async resume() {
    this.state = "running";
  }
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

describe("App", () => {
  it("renders the title and all pads", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "sound3pO",
    );
    expect(screen.getByTestId("pad-c4")).toBeInTheDocument();
    expect(screen.getByTestId("pad-e5")).toBeInTheDocument();
  });

  it("updates the status line after a pad is triggered", () => {
    render(<App />);
    expect(screen.getByTestId("status")).toHaveTextContent("Tap a pad");
    fireEvent.pointerDown(screen.getByTestId("pad-a4"));
    expect(screen.getByTestId("status")).toHaveTextContent("Last note: A4");
    expect(screen.getByTestId("status")).toHaveTextContent("1 played");
  });

  it("responds to keyboard input", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByTestId("status")).toHaveTextContent("Last note: C4");
  });
});
