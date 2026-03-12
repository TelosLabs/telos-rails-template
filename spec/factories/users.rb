# frozen_string_literal: true

FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    password { "password" }
    password_confirmation { "password" }
    confirmed_at { Time.current }

    trait :admin do
      admin { true }
    end

    trait :unconfirmed do
      confirmed_at { nil }
    end
  end
end
