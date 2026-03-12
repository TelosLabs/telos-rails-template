# frozen_string_literal: true

# Default admin user for development
if Rails.env.local?
  User.find_or_create_by!(email: "admin@example.com") do |user|
    user.password = "password"
    user.password_confirmation = "password"
    user.admin = true
    user.confirmed_at = Time.current
  end
end
