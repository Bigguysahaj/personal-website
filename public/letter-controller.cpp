// C++20 reference controller for the browser's letter-sorting simulation.
// Units: scene metres, seconds. Hardware IO belongs in a separate adapter.
#include <array>
#include <cmath>
#include <cstddef>
#include <limits>
#include <optional>

namespace sorting {
struct Vec3 { double x, y, z; };
enum class State { falling, ready, reserved, held, placed };
enum class Phase { scan, approach, grasp, hold, lift, transfer, place, release, retract };
struct Letter {
    char glyph;
    std::size_t slot;
    Vec3 position, destination;
    State state;
};
struct Command { Phase phase; Vec3 target; double duration; };
constexpr Vec3 above(Vec3 p, double clearance) noexcept {
    return {p.x, p.y + 0.30 + clearance, p.z};
}
constexpr double distanceSquared(Vec3 a, Vec3 b) noexcept {
    return (a.x-b.x)*(a.x-b.x) + (a.y-b.y)*(a.y-b.y)
         + (a.z-b.z)*(a.z-b.z);
}

class Controller final {
public:
    // Slot identity disambiguates repeated A, S and H glyphs.
    [[nodiscard]] static std::optional<std::size_t> reserve(
        std::array<Letter, 10>& letters, Vec3 tcp, int side) noexcept {
        std::optional<std::size_t> selected;
        double cost = std::numeric_limits<double>::infinity();
        for (std::size_t i = 0; i < letters.size(); ++i) {
            auto& item = letters[i];
            if (item.state != State::ready) continue;
            if ((item.destination.x < 0 ? -1 : 1) != side) continue;
            const double candidate = distanceSquared(tcp, item.position);
            if (candidate < cost) { selected = i; cost = candidate; }
        }
        if (selected) letters[*selected].state = State::reserved;
        return selected;
    }

    // Nonblocking commands; advance only after the current command completes.
    [[nodiscard]] static std::array<Command, 9> plan(const Letter& item) noexcept {
        const Vec3 pick = item.position, slot = item.destination;
        return {{
            {Phase::approach, above(pick, 1.2), 0.70},
            {Phase::grasp,    above(pick, 0.0), 0.35},
            {Phase::hold,     above(pick, 0.0), 0.20},
            {Phase::lift,     above(pick, 1.2), 0.35},
            {Phase::transfer, above(slot, 1.2), 0.80},
            {Phase::place,    above(slot, 0.0), 0.35},
            {Phase::release,  above(slot, 0.0), 0.20},
            {Phase::retract,  above(slot, 1.2), 0.30},
            {Phase::scan,     above(slot, 1.2), 0.10},
        }};
    }

    static void complete(Letter& item, Phase phase) noexcept {
        if (phase == Phase::grasp) item.state = State::held;
        if (phase == Phase::release) {
            item.position = item.destination;
            item.state = State::placed;
        }
    }

    // Quintic interpolation: zero velocity and acceleration at both ends.
    [[nodiscard]] static double blend(double t) noexcept {
        return t*t*t * (10.0 + t * (-15.0 + 6.0*t));
    }
};
} // namespace sorting
