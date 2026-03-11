# frozen_string_literal: true

# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).
#
# Example:
#
#   ["Action", "Comedy", "Drama", "Horror"].each do |genre_name|
#     MovieGenre.find_or_create_by!(name: genre_name)
#   end

# QA test user for agent_e2e (AI-powered E2E tests)
if Rails.env.local?
  User.find_or_create_by!(email: "qa@example.com") do |user|
    user.password = "Password123!"
    user.password_confirmation = "Password123!"
    user.confirmed_at = Time.current if User.column_names.include?("confirmed_at")
  end
end
